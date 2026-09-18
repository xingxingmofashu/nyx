import type { BrowserWindow } from "electron"
import type { ModelInfo } from "../../renderer/src/types.ts"
import type { NyxServer } from "../server.ts"
import { IPC } from "../../preload/ipc.ts"
import type { LLMTask, ModelPullProgress } from "../../renderer/src/types.ts"
import { PullCancelledError } from "../server.ts"

export class Models {
  private windows = new Set<BrowserWindow>()

  constructor(private readonly server: NyxServer) {}

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  list(): Promise<ModelInfo[]> {
    return this.server.listModels()
  }

  async pull(modelId: string, task: LLMTask): Promise<void> {
    this.broadcast({ modelId, task, done: false })
    try {
      await this.server.pullModel(modelId, task, (p) => {
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

  cancelPull(modelId: string): Promise<boolean> {
    return this.server.cancelPull(modelId)
  }

  remove(modelId: string): Promise<void> {
    return this.server.removeModel(modelId)
  }

  private broadcast(progress: ModelPullProgress): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.models.progress, progress)
    }
  }
}
