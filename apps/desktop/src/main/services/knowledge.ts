import type { BrowserWindow } from "electron"
import type { NyxServer } from "../server.ts"
import { IPC } from "../../preload/ipc.ts"
import type {
  KnowledgeDocument,
  KnowledgeImportResult,
  KnowledgeIndexEvent,
  KnowledgeSearchHit,
  KnowledgeStatus,
} from "../../renderer/src/types.ts"
import { IndexCancelledError } from "../server.ts"

export interface ImportDocument {
  path: string
  content: string
}

export class Knowledge {
  private windows = new Set<BrowserWindow>()

  constructor(private readonly server: NyxServer) {}

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  status(): Promise<KnowledgeStatus> {
    return this.server.knowledgeStatus()
  }

  list(): Promise<KnowledgeDocument[]> {
    return this.server.knowledgeDocuments()
  }

  read(path: string): Promise<string> {
    return this.server.knowledgeDocument(path)
  }

  import(documents: ImportDocument[], overwrite: boolean): Promise<KnowledgeImportResult> {
    return this.server.importKnowledge(documents, overwrite)
  }

  remove(path: string): Promise<void> {
    return this.server.removeKnowledge(path)
  }

  cancelIndex(): Promise<boolean> {
    return this.server.cancelKnowledgeIndex()
  }

  search(query: string, topK?: number): Promise<KnowledgeSearchHit[]> {
    return this.server.searchKnowledge(query, topK)
  }

  async index(rebuild: boolean): Promise<void> {
    this.broadcast({ phase: "embed", filesDone: 0, filesTotal: 0, chunks: 0, done: false })
    try {
      const stats = await this.server.indexKnowledge(rebuild, (p) => {
        this.broadcast({ ...p, done: false })
      })
      this.broadcast({
        phase: "done",
        filesDone: stats.files,
        filesTotal: stats.files,
        chunks: stats.chunks,
        skipped: stats.skipped,
        done: true,
      })
    } catch (error) {
      if (error instanceof IndexCancelledError) {
        this.broadcast({ phase: "done", filesDone: 0, filesTotal: 0, chunks: 0, done: true, cancelled: true })
        return
      }
      this.broadcast({
        phase: "done",
        filesDone: 0,
        filesTotal: 0,
        chunks: 0,
        done: true,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private broadcast(progress: KnowledgeIndexEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.knowledge.progress, progress)
    }
  }
}
