import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { realpathNearest } from "../workspace";
import DESCRIPTION from "./glob.txt";

/** Max entries walked before bailing out. */
const MAX_WALK_FILES = 20_000;
/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;

/** Build the `glob` tool. Read-only, so it runs without approval. */
export function createGlobTool(workspaceDir: string): ToolSet {
  const root = realpathNearest(resolve(workspaceDir));

  return {
    glob: tool({
      description: DESCRIPTION,
      inputSchema: z.object({
        pattern: z.string().describe("Glob pattern, e.g. 'src/**/*.ts'"),
        maxResults: z.number().int().positive().optional().describe("Maximum results (default 200)"),
      }),
      execute: async ({ pattern, maxResults }) => {
        const matcher = globToRegExp(pattern);
        const entries = await walkEntries(root);
        const max = maxResults ?? 200;
        const matches: string[] = [];
        // A trailing slash targets directories, so match it against "dir/"; every
        // other pattern matches the bare relative path (files and directories).
        const trailingSlash = pattern.endsWith("/");
        for (const entry of entries) {
          const rel = relative(root, entry.path).split(sep).join("/");
          const hit = entry.isDir && trailingSlash ? matcher.test(`${rel}/`) : matcher.test(rel);
          if (hit) matches.push(entry.isDir ? `${rel}/` : rel);
          if (matches.length >= max) break;
        }
        return clamp(matches.join("\n") || "(no matches)");
      },
    }),
  };
}

function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (output truncated)` : text;
}

/** A walked path plus whether it is a directory. */
interface WalkEntry {
  path: string;
  isDir: boolean;
}

/**
 * Recursively list files and directories under `dir`, skipping
 * node_modules/.git. Directories are included so single-segment patterns and
 * directory-suffixed patterns (e.g. "src/") can match them.
 */
async function walkEntries(dir: string): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  async function walk(current: string): Promise<void> {
    if (out.length >= MAX_WALK_FILES) return;
    const entries = await readdir(current, { withFileTypes: true, encoding: "utf8" }).catch(() => null);
    if (!entries) return;
    for (const entry of entries) {
      if (out.length >= MAX_WALK_FILES) return;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        out.push({ path: full, isDir: true });
        await walk(full);
      } else if (entry.isFile()) {
        out.push({ path: full, isDir: false });
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
