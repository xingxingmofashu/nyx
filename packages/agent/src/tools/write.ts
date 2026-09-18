import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./write.txt"

export class Write {
  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      write_file: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          path: z.string().describe("Path relative to the workspace root"),
          content: z.string().describe("Full file content"),
        }),
        execute: async ({ path, content }) => {
          const file = Workspace.resolve(root, path)
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, content, "utf8")
          return `Wrote ${Buffer.byteLength(content)} bytes to ${path}`
        },
      }),
    }
  }
}
