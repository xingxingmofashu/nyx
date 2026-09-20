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
  private static readonly SHELL =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh"
  private static readonly DESCRIPTION = Bash.render()

  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      bash: tool({
        description: Bash.DESCRIPTION,
        inputSchema: z.object({
          command: z.string().describe("Shell command to execute"),
          timeoutMs: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Timeout in ms (default 30000, max 120000)"),
        }),
        execute: async ({ command, timeoutMs }, { abortSignal }) => {
          const timeout = Math.min(
            timeoutMs ?? Bash.DEFAULT_TIMEOUT_MS,
            Bash.MAX_TIMEOUT_MS,
          )
          try {
            const { stdout, stderr } = await Bash.exec(command, {
              cwd: root,
              timeout,
              maxBuffer: Bash.MAX_BUFFER,
              windowsHide: true,
              ...(abortSignal ? { signal: abortSignal } : {}),
            })
            return Bash.truncate(`exit 0\n${stdout}${stderr}`)
          } catch (error) {
            if (abortSignal?.aborted) throw error
            const failure = error as {
              code?: number
              stdout?: string
              stderr?: string
              message: string
              killed?: boolean
            }
            const headline = failure.killed
              ? `timed out after ${timeout}ms`
              : `exit ${failure.code ?? 1}`
            const detail =
              `${failure.stdout ?? ""}${failure.stderr ?? ""}` ||
              (failure.killed ? "" : failure.message)
            return Bash.truncate(`${headline}\n${detail}`)
          }
        },
      }),
    }
  }

  private static render(): string {
    return Bash.interpolate(DESCRIPTION, {
      intro:
        "Executes a given bash command with optional timeout, ensuring proper handling and security measures.",
      os: process.platform,
      shell: Bash.SHELL,
      workdirSection:
        "All commands run in the workspace root; there is no workdir parameter. A `cd` inside a command affects only that command and does not persist.",
      commandSection: Bash.commandSection(),
    })
  }

  private static commandSection(): string {
    return `Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use \`ls\` to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use \`ls foo\` to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., rm "path with spaces/file.txt")
   - Examples of proper quoting:
     - mkdir "/Users/name/My Documents" (correct)
     - mkdir /Users/name/My Documents (incorrect - will fail)
     - python "/path/with spaces/script.py" (correct)
     - python /path/with spaces/script.py (incorrect - will fail)
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
  - The command argument is required.
  - Each call starts a new shell in the workspace root, so \`cd\` and exported variables do not carry over to later calls.
  - You can specify an optional timeout in milliseconds. If not specified, commands time out after ${Bash.DEFAULT_TIMEOUT_MS}ms; no call can exceed ${Bash.MAX_TIMEOUT_MS}ms.
  - The combined stdout/stderr is truncated at ${Bash.MAX_OUTPUT} characters. Do NOT use \`head\`, \`tail\`, or other truncation commands to limit output; if you need more, redirect to a file in the workspace and read it with read_file.
  - Avoid using bash with the \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
    - File search: Use glob (NOT find or ls)
    - Content search: Use grep (NOT grep or rg)
    - Read files: Use read_file (NOT cat/head/tail)
    - Edit files: Use edit_file (NOT sed/awk)
    - Write files: Use write_file (NOT echo >/cat <<EOF)
    - Communication: Output text directly (NOT echo/printf)
  - When issuing multiple commands:
    - If the commands are independent and can run in parallel, make multiple bash tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two bash tool calls in parallel.
    - If the commands depend on each other and must run sequentially, use a single bash call with '&&' to chain them together (e.g., \`git add . && git commit -m "message" && git push\`). For instance, if one operation must complete before another starts (like mkdir before cp, or Write before bash for git operations), run these operations sequentially instead.
    - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
    - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
  - The working directory is always the workspace root; pass workspace-relative paths.`
  }

  private static interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
      const value = values[key]
      if (value === undefined) throw new Error(`Missing bash prompt value: ${key}`)
      return value
    })
  }

  private static truncate(value: string): string {
    return value.length > Bash.MAX_OUTPUT
      ? `${value.slice(0, Bash.MAX_OUTPUT)}\n… (truncated)`
      : value
  }
}
