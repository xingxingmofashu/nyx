import type { BrowserWindow } from "electron"
import type { NyxServerProcess } from "../server"
import { IPC } from "../../shared/ipc"
import type {
  KnowledgeDocument,
  KnowledgeImportResult,
  KnowledgeIndexEvent,
  KnowledgeSearchHit,
  KnowledgeStatus,
} from "../../shared/types"
import type { ImportDocument } from "../knowledge-import"
import { IndexCancelledError } from "../server/client"

/**
 * Bridges the knowledge base to the inference server. A stateless proxy over
 * the server's `/v1/knowledge` routes: reads and writes go straight through,
 * and an index build streams its progress to every attached window on
 * `IPC.knowledge.progress`.
 */
export class KnowledgeService {
  private windows = new Set<BrowserWindow>()

  constructor(private readonly server: NyxServerProcess) {}

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  status(): Promise<KnowledgeStatus> {
    return this.server.client.knowledgeStatus()
  }

  list(): Promise<KnowledgeDocument[]> {
    return this.server.client.knowledgeDocuments()
  }

  read(path: string): Promise<string> {
    return this.server.client.knowledgeDocument(path)
  }

  import(documents: ImportDocument[], overwrite: boolean): Promise<KnowledgeImportResult> {
    return this.server.client.importKnowledge(documents, overwrite)
  }

  remove(path: string): Promise<void> {
    return this.server.client.removeKnowledge(path)
  }

  cancelIndex(): Promise<boolean> {
    return this.server.client.cancelKnowledgeIndex()
  }

  search(query: string, topK?: number): Promise<KnowledgeSearchHit[]> {
    return this.server.client.searchKnowledge(query, topK)
  }

  /** Build the index (or rebuild it), streaming progress to all windows. */
  async index(rebuild: boolean): Promise<void> {
    this.broadcast({ phase: "embed", filesDone: 0, filesTotal: 0, chunks: 0, done: false })
    try {
      const stats = await this.server.client.indexKnowledge(rebuild, (p) => {
        this.broadcast({ ...p, done: false })
      })
      this.broadcast({ phase: "done", filesDone: stats.files, filesTotal: stats.files, chunks: stats.chunks, done: true })
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
