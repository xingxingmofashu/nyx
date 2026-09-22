import { readFile, stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./edit.txt"

export class Edit {
  private static readonly MAX_FILE_BYTES = 10 * 1024 * 1024

  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      edit_file: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          path: z.string().describe("Path relative to the workspace root"),
          oldString: z.string().min(1).describe("Exact text to replace"),
          newString: z.string().describe("Replacement text"),
          replaceAll: z
            .boolean()
            .optional()
            .describe("Replace every occurrence instead of exactly one"),
        }),
        execute: async ({ path, oldString, newString, replaceAll }) => {
          const file = Workspace.resolve(root, path)
          const info = await stat(file)
          if (info.size > Edit.MAX_FILE_BYTES) {
            throw new Error(`file too large to edit (max ${Edit.MAX_FILE_BYTES / 1024 / 1024} MB)`)
          }
          const raw = await readFile(file, "utf8")
          const count = raw.split(oldString).length - 1
          if (count === 0) throw new Error(`oldString not found in ${path}`)
          if (count > 1 && !replaceAll) {
            throw new Error(
              `oldString occurs ${count} times in ${path}; pass replaceAll to replace them all`,
            )
          }
          const updated = raw.split(oldString).join(newString)
          await writeFile(file, updated, "utf8")
          return `Edited ${path} (${replaceAll ? count : 1} replacement${replaceAll && count > 1 ? "s" : ""})`
        },
      }),
    }
  }
}
