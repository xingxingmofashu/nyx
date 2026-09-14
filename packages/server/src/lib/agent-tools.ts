import { exec } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod/v4";
import type { AgentTool, AgentToolSet } from "@nyx/agent";

const execAsync = promisify(exec);

/** Max files walked by glob/grep before bailing out. */
const MAX_WALK_FILES = 20_000;
/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;

/**
 * Build the coding tools for one workspace. Every path-based tool refuses to
 * escape `workspaceDir`; writes and shell commands require user approval.
 */
export function createAgentTools(workspaceDir: string): AgentToolSet {
  const root = realpathNearest(resolve(workspaceDir));

  return [
    {
      name: "read_file",
      description:
        "Read a UTF-8 text file from the workspace. Returns line-numbered content. Use offset/limit for large files.",
      approval: "never",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the workspace root"),
        offset: z.number().int().positive().optional().describe("1-based first line to read"),
        limit: z.number().int().positive().optional().describe("Maximum number of lines to read"),
      }),
      execute: async ({ path, offset, limit }) => {
        const file = within(root, path);
        const lines = (await readFile(file, "utf8")).split("\n");
        const start = (offset ?? 1) - 1;
        const end = limit ? start + limit : lines.length;
        return clamp(
          lines
            .slice(start, end)
            .map((line, i) => `${start + i + 1}\t${line}`)
            .join("\n") || "(empty file)",
        );
      },
    },
    {
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file in the workspace. Creates parent directories.",
      approval: "always",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the workspace root"),
        content: z.string().describe("Full file content"),
      }),
      execute: async ({ path, content }) => {
        const file = within(root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
        return `Wrote ${Buffer.byteLength(content)} bytes to ${path}`;
      },
    },
    {
      name: "edit_file",
      description:
        "Replace an exact string in a file. Fails if oldString is not found or is ambiguous (multiple matches) unless replaceAll is true.",
      approval: "always",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the workspace root"),
        oldString: z.string().min(1).describe("Exact text to replace"),
        newString: z.string().describe("Replacement text"),
        replaceAll: z.boolean().optional().describe("Replace every occurrence instead of exactly one"),
      }),
      execute: async ({ path, oldString, newString, replaceAll }) => {
        const file = within(root, path);
        const raw = await readFile(file, "utf8");
        const count = raw.split(oldString).length - 1;
        if (count === 0) throw new Error(`oldString not found in ${path}`);
        if (count > 1 && !replaceAll) {
          throw new Error(`oldString occurs ${count} times in ${path}; pass replaceAll to replace them all`);
        }
        const updated = replaceAll ? raw.split(oldString).join(newString) : raw.replace(oldString, newString);
        await writeFile(file, updated, "utf8");
        return `Edited ${path} (${replaceAll ? count : 1} replacement${replaceAll && count > 1 ? "s" : ""})`;
      },
    },
    {
      name: "bash",
      description:
        "Run a shell command in the workspace root. Returns combined stdout/stderr and the exit code. Requires user approval.",
      approval: "always",
      inputSchema: z.object({
        command: z.string().describe("Shell command to execute"),
        timeoutMs: z.number().int().positive().optional().describe("Timeout in ms (default 30000, max 120000)"),
      }),
      execute: async ({ command, timeoutMs }) => {
        const timeout = Math.min(timeoutMs ?? 30_000, 120_000);
        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: root,
            timeout,
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true,
          });
          return clamp(`exit 0\n${stdout}${stderr}`);
        } catch (error) {
          const e = error as { code?: number; stdout?: string; stderr?: string; message: string };
          return clamp(`exit ${e.code ?? 1}\n${e.stdout ?? ""}${e.stderr ?? e.message}`);
        }
      },
    },
    {
      name: "grep",
      description: "Search file contents with a JavaScript regular expression, recursively under the workspace.",
      approval: "never",
      inputSchema: z.object({
        pattern: z.string().describe("JavaScript regular expression source"),
        path: z.string().optional().describe("Directory or file to search, relative to the workspace (default: root)"),
        glob: z.string().optional().describe("Only search files matching this glob (e.g. '**/*.ts')"),
        maxResults: z.number().int().positive().optional().describe("Maximum matches (default 100)"),
      }),
      execute: async ({ pattern, path, glob, maxResults }) => {
        let matcher: RegExp;
        try {
          matcher = new RegExp(pattern);
        } catch {
          throw new Error(`invalid regular expression: ${pattern}`);
        }
        const base = within(root, path ?? ".");
        const filter = glob ? globToRegExp(glob) : null;
        const info = await stat(base).catch(() => null);
        const files = info?.isFile() ? [base] : await walkFiles(base, filter);
        const max = maxResults ?? 100;
        const out: string[] = [];
        for (const file of files) {
          if (out.length >= max) break;
          let content: string;
          try {
            content = await readFile(file, "utf8");
          } catch {
            continue;
          }
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && out.length < max; i++) {
            const line = lines[i] ?? "";
            if (matcher.test(line)) out.push(`${relative(root, file)}:${i + 1}:${line.slice(0, 300)}`);
          }
        }
        return clamp(out.join("\n") || "(no matches)");
      },
    },
    {
      name: "glob",
      description: "List workspace files whose relative path matches a glob pattern (supports *, ?, **).",
      approval: "never",
      inputSchema: z.object({
        pattern: z.string().describe("Glob pattern, e.g. 'src/**/*.ts'"),
        maxResults: z.number().int().positive().optional().describe("Maximum results (default 200)"),
      }),
      execute: async ({ pattern, maxResults }) => {
        const matcher = globToRegExp(pattern);
        const files = await walkFiles(root, null);
        const max = maxResults ?? 200;
        const matches: string[] = [];
        for (const file of files) {
          const rel = relative(root, file).split(sep).join("/");
          if (matcher.test(rel)) matches.push(rel);
          if (matches.length >= max) break;
        }
        return clamp(matches.join("\n") || "(no matches)");
      },
    },
  ] as AgentToolSet;
}

/**
 * Resolve `p` under `root`, rejecting paths that escape the workspace. Both
 * the lexical path and its symlink-resolved form are checked, so a symlink
 * inside the workspace cannot reach outside it.
 */
function within(root: string, p: string): string {
  const resolved = resolve(root, p);
  assertWithin(root, resolved);
  assertWithin(root, realpathNearest(resolved));
  return resolved;
}

/** Throw when `target` is not `root` or a descendant of it. */
function assertWithin(root: string, target: string): void {
  const rel = relative(root, target);
  const inside = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  if (!inside) throw new Error(`path escapes workspace: ${target}`);
}

/** `realpath` the nearest existing ancestor, rejoining the missing tail. */
function realpathNearest(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    if (parent === p) return p;
    return join(realpathNearest(parent), basename(p));
  }
}

function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (output truncated)` : text;
}

/** Recursively list files under `dir`, skipping node_modules/.git. */
async function walkFiles(dir: string, filter: RegExp | null): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    if (out.length >= MAX_WALK_FILES) return;
    const entries = await readdir(current, { withFileTypes: true, encoding: "utf8" }).catch(() => null);
    if (!entries) return;
    for (const entry of entries) {
      if (out.length >= MAX_WALK_FILES) return;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const rel = relative(dir, full).split(sep).join("/");
        if (!filter || filter.test(rel)) out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

/** Compile a small glob (`*`, `?`, `**`) into an anchored regular expression. */
function globToRegExp(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        i += 2;
        if (pattern[i] === "/") {
          i++;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        i++;
        out += "[^/]*";
      }
    } else if (char === "?") {
      i++;
      out += "[^/]";
    } else {
      i++;
      out += (char ?? "").replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}
