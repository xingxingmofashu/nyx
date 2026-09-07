import type { BrowserWindow } from "electron"
import type { ModelInfo } from "@nyx/config"
import type { NyxServer } from "../server"
import { IPC } from "../../shared/ipc"
import type { LLMTask, ModelPullProgress } from "../../shared/types"

/**
 * Bridges model management to the inference server. Stateless proxy: the
 * caller passes the model id with each request. Pull progress from the server
 * SSE stream is broadcast to all attached windows on `IPC.models.progress`.
 */
export class ModelsService {
  private readonly server: NyxServer
  private windows = new Set<BrowserWindow>()

  constructor(manager: NyxServer) {
    this.server = manager
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  list(): Promise<ModelInfo[]> {
    return this.server.client.listModels()
  }

  /** Pull a model, streaming progress to all windows until done/error. */
  async pull(modelId: string, task: LLMTask): Promise<void> {
    this.broadcast({ modelId, task, done: false })
    try {
      await this.server.client.pullModel(modelId, task, (p) => {
        this.broadcast({ modelId, task, done: false, ...p })
      })
      this.broadcast({ modelId, task, done: true })
    } catch (error) {
      this.broadcast({
        modelId,
        task,
        done: true,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  remove(modelId: string): Promise<void> {
    return this.server.client.removeModel(modelId)
  }

  private broadcast(progress: ModelPullProgress): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.models.progress, progress)
    }
  }
}
