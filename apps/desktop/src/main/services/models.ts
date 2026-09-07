import type { BrowserWindow } from "electron"
import type { ModelInfo } from "@nyx/config"
import type { NyxServer } from "../server"
import { IPC } from "../../shared/ipc"
import type { LLMTask, ModelPullProgress } from "../../shared/types"
import { PullCancelledError } from "../server/client"

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

  /** Pull a model, streaming progress to all windows until done/error/cancel. */
  async pull(modelId: string, task: LLMTask): Promise<void> {
    this.broadcast({ modelId, task, done: false })
    try {
      await this.server.client.pullModel(modelId, task, (p) => {
        this.broadcast({ modelId, task, done: false, ...p })
      })
      this.broadcast({ modelId, task, done: true })
    } catch (error) {
      if (error instanceof PullCancelledError) {
        this.broadcast({ modelId, task, done: true, cancelled: true })
        return
      }
      this.broadcast({
        modelId,
        task,
        done: true,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Ask the server to stop an in-flight pull; the SSE stream reports `cancelled`.
   * Resolves true when a running pull was actually aborted.
   */
  cancelPull(modelId: string): Promise<boolean> {
    return this.server.client.cancelPull(modelId)
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
