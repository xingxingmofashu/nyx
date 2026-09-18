import { readdir } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./glob.txt"

interface WalkEntry {
  path: string
  isDir: boolean
}

export class Glob {
  private static readonly MAX_FILES = 20_000
  private static readonly IGNORED = new Set(["node_modules", ".git"])
  private static readonly MAX_OUTPUT = 40_000

  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      glob: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          pattern: z.string().describe("Glob pattern, e.g. 'src/**/*.ts'"),
          maxResults: z.number().int().positive().optional().describe("Maximum results (default 200)"),
        }),
        execute: async ({ pattern, maxResults }) => {
          const matcher = Glob.toRegExp(pattern)
          const entries = await Glob.walk(root)
          const max = maxResults ?? 200
          const matches: string[] = []
          const trailingSlash = pattern.endsWith("/")
          for (const entry of entries) {
            const rel = relative(root, entry.path).split(sep).join("/")
            const hit = entry.isDir && trailingSlash ? matcher.test(`${rel}/`) : matcher.test(rel)
            if (hit) matches.push(entry.isDir ? `${rel}/` : rel)
            if (matches.length >= max) break
          }
          return Glob.truncate(matches.join("\n") || "(no matches)")
        },
      }),
    }
  }

  private static async walk(dir: string): Promise<WalkEntry[]> {
    const out: WalkEntry[] = []
    const visit = async (current: string): Promise<void> => {
      if (out.length >= Glob.MAX_FILES) return
      const entries = await readdir(current, { withFileTypes: true, encoding: "utf8" }).catch(
        () => null,
      )
      if (!entries) return
      for (const entry of entries) {
        if (out.length >= Glob.MAX_FILES) return
        if (Glob.IGNORED.has(entry.name)) continue
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          out.push({ path: full, isDir: true })
          await visit(full)
        } else if (entry.isFile()) {
          out.push({ path: full, isDir: false })
        }
      }
    }
    await visit(dir)
    return out
  }

  private static toRegExp(pattern: string): RegExp {
    let out = ""
    let i = 0
    while (i < pattern.length) {
      const char = pattern[i]
      if (char === "*") {
        if (pattern[i + 1] === "*") {
          i += 2
          if (pattern[i] === "/") {
            i++
            out += "(?:.*/)?"
          } else {
            out += ".*"
          }
        } else {
          i++
          out += "[^/]*"
        }
      } else if (char === "?") {
        i++
        out += "[^/]"
      } else {
        i++
        out += (char ?? "").replace(/[.+^${}()|[\]\\]/g, "\\$&")
      }
    }
    return new RegExp(`^${out}$`)
  }

  private static truncate(value: string): string {
    return value.length > Glob.MAX_OUTPUT
      ? `${value.slice(0, Glob.MAX_OUTPUT)}\n… (truncated)`
      : value
  }
}
