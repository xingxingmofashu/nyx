import { exec } from "node:child_process"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./bash.txt"

export class Bash {
  private static readonly exec = promisify(exec)
  private static readonly DEFAULT_TIMEOUT_MS = 30_000
  private static readonly MAX_TIMEOUT_MS = 120_000
  private static readonly MAX_BUFFER = 10 * 1024 * 1024
  private static readonly MAX_OUTPUT = 40_000

  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      bash: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          command: z.string().describe("Shell command to execute"),
          timeoutMs: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Timeout in ms (default 30000, max 120000)"),
        }),
        execute: async ({ command, timeoutMs }) => {
          const timeout = Math.min(timeoutMs ?? Bash.DEFAULT_TIMEOUT_MS, Bash.MAX_TIMEOUT_MS)
          try {
            const { stdout, stderr } = await Bash.exec(command, {
              cwd: root,
              timeout,
              maxBuffer: Bash.MAX_BUFFER,
              windowsHide: true,
            })
            return Bash.truncate(`exit 0\n${stdout}${stderr}`)
          } catch (error) {
            const failure = error as {
              code?: number
              stdout?: string
              stderr?: string
              message: string
              killed?: boolean
            }
            const headline = failure.killed ? `timed out after ${timeout}ms` : `exit ${failure.code ?? 1}`
            const detail =
              `${failure.stdout ?? ""}${failure.stderr ?? ""}` || (failure.killed ? "" : failure.message)
            return Bash.truncate(`${headline}\n${detail}`)
          }
        },
      }),
    }
  }

  private static truncate(value: string): string {
    return value.length > Bash.MAX_OUTPUT
      ? `${value.slice(0, Bash.MAX_OUTPUT)}\n… (truncated)`
      : value
  }
}
