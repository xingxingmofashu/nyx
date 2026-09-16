import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { realpathNearest, workspacePath } from "../workspace";
import DESCRIPTION from "./write.txt";

/** Build the `write_file` tool. Writes, so it requires user approval. */
export function createWriteFileTool(workspaceDir: string): ToolSet {
  const root = realpathNearest(resolve(workspaceDir));

  return {
    write_file: tool({
      description: DESCRIPTION,
      inputSchema: z.object({
        path: z.string().describe("Path relative to the workspace root"),
        content: z.string().describe("Full file content"),
      }),
      execute: async ({ path, content }) => {
        const file = workspacePath(root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
        return `Wrote ${Buffer.byteLength(content)} bytes to ${path}`;
      },
    }),
  };
}
