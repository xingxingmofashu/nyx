import { ipcMain } from "electron"
import { readdir, readFile, stat } from "node:fs/promises"
import { basename, join, relative, sep } from "node:path"
import type { Dirent } from "node:fs"
import { IPC } from "../../preload/ipc.ts"
import type { KnowledgeImportResult } from "../../renderer/src/types.ts"
import type { ImportDocument, Knowledge as KnowledgeService } from "../services/knowledge.ts"
import { Dialog } from "./dialog.ts"

export class Knowledge {
  private static readonly MARKDOWN_EXTENSIONS = [".md", ".markdown"]
  private static readonly IGNORED_DIRS = new Set(["node_modules", ".git"])
  private static readonly MAX_IMPORT_BYTES = 5 * 1024 * 1024
  private static readonly MAX_PREVIEW_PATHS = 10

  static register(service: KnowledgeService): void {
    ipcMain.handle(IPC.knowledge.status, () => service.status())
    ipcMain.handle(IPC.knowledge.list, () => service.list())
    ipcMain.handle(IPC.knowledge.read, (_e, path: string) => service.read(path))
    ipcMain.handle(IPC.knowledge.importFiles, async (e, target: string) => {
      const paths = await Dialog.pickFiles(e)
      if (paths === null) return null
      return await Knowledge.importDocuments(e, service, await Knowledge.readPicked(paths, target))
    })
    ipcMain.handle(IPC.knowledge.importFolder, async (e, target: string) => {
      const dir = await Dialog.pickDirectory(e)
      if (dir === null) return null
      return await Knowledge.importDocuments(e, service, await Knowledge.readFolder(dir, target))
    })
    ipcMain.handle(IPC.knowledge.remove, async (e, path: string) => {
      const confirmed = await Dialog.confirm(e, {
        message: "Delete this document?",
        detail: `${path}\n\nThe file is removed from the knowledge base and its index entries are dropped.`,
        confirmLabel: "Delete",
      })
      if (!confirmed) return false
      await service.remove(path)
      return true
    })
    ipcMain.handle(IPC.knowledge.index, (_e, rebuild: boolean) => service.index(rebuild))
    ipcMain.handle(IPC.knowledge.cancelIndex, () => service.cancelIndex())
    ipcMain.handle(IPC.knowledge.search, (_e, query: string, topK?: number) => service.search(query, topK))
  }

  private static async importDocuments(
    e: Electron.IpcMainInvokeEvent,
    service: KnowledgeService,
    documents: ImportDocument[],
  ): Promise<KnowledgeImportResult> {
    if (documents.length === 0) return { written: [], overwritten: [], skipped: [] }
    const existing = new Set((await service.list()).map((doc) => doc.file))
    const conflicts = documents.filter((doc) => existing.has(doc.path)).map((doc) => doc.path)
    const overwrite =
      conflicts.length === 0 ||
      (await Dialog.confirm(e, {
        message: conflicts.length === 1 ? "This document already exists" : `${conflicts.length} documents already exist`,
        detail: `${Knowledge.previewPaths(conflicts)}\n\nOverwrite them, or skip them and import the rest?`,
        confirmLabel: "Overwrite",
        cancelLabel: "Skip",
      }))
    return await service.import(documents, overwrite)
  }

  private static previewPaths(paths: string[]): string {
    const shown = paths.slice(0, Knowledge.MAX_PREVIEW_PATHS).join("\n")
    return paths.length > Knowledge.MAX_PREVIEW_PATHS
      ? `${shown}\n… and ${paths.length - Knowledge.MAX_PREVIEW_PATHS} more`
      : shown
  }

  private static async readPicked(paths: string[], target = ""): Promise<ImportDocument[]> {
    const folder = Knowledge.requireTarget(target)
    const documents: ImportDocument[] = []
    for (const path of paths) {
      if (!Knowledge.isMarkdown(path) || !(await Knowledge.isReadableFile(path))) continue
      documents.push({
        path: Knowledge.underTarget(folder, basename(path)),
        content: await readFile(path, "utf8"),
      })
    }
    return documents.sort((a, b) => a.path.localeCompare(b.path))
  }

  private static async readFolder(dir: string, target = ""): Promise<ImportDocument[]> {
    const folder = Knowledge.requireTarget(target)
    const root = basename(dir)
    const documents: ImportDocument[] = []
    const walk = async (current: string): Promise<void> => {
      let entries: Dirent[]
      try {
        entries = await readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".") || Knowledge.IGNORED_DIRS.has(entry.name)) continue
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile() && Knowledge.isMarkdown(entry.name) && (await Knowledge.isReadableFile(full))) {
          documents.push({
            path: Knowledge.underTarget(folder, Knowledge.toPosix(join(root, relative(dir, full)))),
            content: await readFile(full, "utf8"),
          })
        }
      }
    }
    await walk(dir)
    return documents.sort((a, b) => a.path.localeCompare(b.path))
  }

  private static isMarkdown(path: string): boolean {
    const lower = path.toLowerCase()
    return Knowledge.MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension))
  }

  private static async isReadableFile(path: string): Promise<boolean> {
    try {
      const stats = await stat(path)
      return stats.isFile() && stats.size <= Knowledge.MAX_IMPORT_BYTES
    } catch {
      return false
    }
  }

  private static requireTarget(target: string): string {
    const segments = target.trim().split("/").filter((segment) => segment !== "")
    const valid = segments.every((segment) => segment !== "." && segment !== ".." && !segment.startsWith("."))
    if (!valid) throw new Error(`Invalid import target: ${target}`)
    return segments.join("/")
  }

  private static underTarget(folder: string, path: string): string {
    return Knowledge.toPosix(folder === "" ? path : `${folder}/${path}`)
  }

  private static toPosix(path: string): string {
    return sep === "/" ? path : path.split(sep).join("/")
  }
}
