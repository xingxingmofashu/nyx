import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./read.txt"

export class Read {
  private static readonly MAX_OUTPUT = 40_000
  private static readonly MAX_FILE_BYTES = 10 * 1024 * 1024

  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      read_file: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          path: z.string().describe("Path relative to the workspace root"),
          offset: z.number().int().positive().optional().describe("1-based first line to read"),
          limit: z.number().int().positive().optional().describe("Maximum number of lines to read"),
        }),
        execute: async ({ path, offset, limit }) => {
          const file = Workspace.resolve(root, path)
          const info = await stat(file)
          if (!info.isFile()) throw new Error(`not a file: ${path}`)
          if (info.size > Read.MAX_FILE_BYTES) {
            throw new Error(`file too large to read (max ${Read.MAX_FILE_BYTES / 1024 / 1024} MB)`)
          }
          const lines = (await readFile(file, "utf8")).split("\n")
          const start = (offset ?? 1) - 1
          const end = limit ? start + limit : lines.length
          return Read.truncate(
            lines
              .slice(start, end)
              .map((line, i) => `${start + i + 1}\t${line}`)
              .join("\n") || "(empty file)",
          )
        },
      }),
    }
  }

  private static truncate(value: string): string {
    return value.length > Read.MAX_OUTPUT
      ? `${value.slice(0, Read.MAX_OUTPUT)}\n… (truncated)`
      : value
  }
}
