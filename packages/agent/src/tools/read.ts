import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { realpathNearest, workspacePath } from "../workspace";
import DESCRIPTION from "./read.txt";

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;

/** Build the `read_file` tool. Read-only, so it runs without approval. */
export function createReadFileTool(workspaceDir: string): ToolSet {
  const root = realpathNearest(resolve(workspaceDir));

  return {
    read_file: tool({
      description: DESCRIPTION,
      inputSchema: z.object({
        path: z.string().describe("Path relative to the workspace root"),
        offset: z.number().int().positive().optional().describe("1-based first line to read"),
        limit: z.number().int().positive().optional().describe("Maximum number of lines to read"),
      }),
      execute: async ({ path, offset, limit }) => {
        const file = workspacePath(root, path);
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
    }),
  };
}

function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (output truncated)` : text;
}
