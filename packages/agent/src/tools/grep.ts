import { readFile, readdir, stat } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./grep.txt"

interface WalkEntry {
  path: string
  isDir: boolean
}

export class Grep {
  private static readonly MAX_FILES = 20_000
  private static readonly MAX_FILE_BYTES = 5 * 1024 * 1024
  private static readonly IGNORED = new Set(["node_modules", ".git"])
  private static readonly MAX_OUTPUT = 40_000

  static create(workspaceDir: string): ToolSet {
    const root = Workspace.realpathNearest(resolve(workspaceDir))

    return {
      grep: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          pattern: z.string().describe("JavaScript regular expression source"),
          path: z
            .string()
            .optional()
            .describe("Directory or file to search, relative to the workspace (default: root)"),
          glob: z.string().optional().describe("Only search files matching this glob (e.g. '**/*.ts')"),
          maxResults: z
            .number()
            .int()
            .positive()
            .max(1000)
            .optional()
            .describe("Maximum matches (default 100, max 1000)"),
        }),
        execute: async ({ pattern, path, glob, maxResults }) => {
          let matcher: RegExp
          try {
            matcher = new RegExp(pattern)
          } catch {
            throw new Error(`invalid regular expression: ${pattern}`)
          }
          const base = Workspace.resolve(root, path ?? ".")
          const filter = glob ? Grep.toRegExp(glob) : null
          const info = await stat(base).catch(() => null)
          const files = info?.isFile() ? [base] : await Grep.files(base, filter)
          const max = maxResults ?? 100
          const out: string[] = []
          for (const file of files) {
            if (out.length >= max) break
            let content: string
            try {
              const info = await stat(file)
              if (!info.isFile() || info.size > Grep.MAX_FILE_BYTES) continue
              content = await readFile(file, "utf8")
            } catch {
              continue
            }
            const lines = content.split("\n")
            for (let i = 0; i < lines.length && out.length < max; i++) {
              const line = lines[i] ?? ""
              if (matcher.test(line)) out.push(`${relative(root, file)}:${i + 1}:${line.slice(0, 300)}`)
            }
          }
          return Grep.truncate(out.join("\n") || "(no matches)")
        },
      }),
    }
  }

  private static async files(dir: string, filter: RegExp | null): Promise<string[]> {
    const entries = await Grep.walk(dir)
    return entries
      .filter((entry) => {
        if (entry.isDir) return false
        if (!filter) return true
        return filter.test(relative(dir, entry.path).split(sep).join("/"))
      })
      .map((entry) => entry.path)
  }

  private static async walk(dir: string): Promise<WalkEntry[]> {
    const out: WalkEntry[] = []
    const visit = async (current: string): Promise<void> => {
      if (out.length >= Grep.MAX_FILES) return
      const entries = await readdir(current, { withFileTypes: true, encoding: "utf8" }).catch(
        () => null,
      )
      if (!entries) return
      for (const entry of entries) {
        if (out.length >= Grep.MAX_FILES) return
        if (Grep.IGNORED.has(entry.name)) continue
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
    return value.length > Grep.MAX_OUTPUT
      ? `${value.slice(0, Grep.MAX_OUTPUT)}\n… (truncated)`
      : value
  }
}
