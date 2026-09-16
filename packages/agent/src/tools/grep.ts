import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { realpathNearest, workspacePath } from "../workspace";
import DESCRIPTION from "./grep.txt";

/** Max files walked before bailing out. */
const MAX_WALK_FILES = 20_000;
/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;

/** Build the `grep` tool. Read-only, so it runs without approval. */
export function createGrepTool(workspaceDir: string): ToolSet {
  const root = realpathNearest(resolve(workspaceDir));

  return {
    grep: tool({
      description: DESCRIPTION,
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
        const base = workspacePath(root, path ?? ".");
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
    }),
  };
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
