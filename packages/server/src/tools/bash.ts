import { exec } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { realpathNearest } from "../workspace";
import DESCRIPTION from "./bash.txt";

const execAsync = promisify(exec);

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;

/** Build the `bash` tool. Requires user approval. */
export function createBashTool(workspaceDir: string): ToolSet {
  const root = realpathNearest(resolve(workspaceDir));

  return {
    bash: tool({
      description: DESCRIPTION,
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
    }),
  };
}

function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (output truncated)` : text;
}
