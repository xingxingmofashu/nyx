import type { BrowserWindow } from "electron"
import type { ServerManager } from "../server/manager"
import { IPC } from "../../shared/ipc"
import type { TextGenerationEvent, LLMMessage } from "../../shared/types"

/**
 * Bridges the text-generation tool to the inference server.
 *
 * Stateless proxy: model selection and busy state live in the renderer; each
 * turn passes its model + full transcript. The server's SSE events are
 * forwarded to windows verbatim (delta/end/error).
 */
export class TextGenerationService {
  private readonly manager: ServerManager
  private windows = new Set<BrowserWindow>()
  private abortController: AbortController | null = null

  constructor(manager: ServerManager) {
    this.manager = manager
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  abort(): void {
    this.abortController?.abort()
  }

  /** Start a streaming chat turn; SSE events are pushed to windows. */
  async send(modelId: string, messages: LLMMessage[]): Promise<void> {
    const controller = new AbortController()
    this.abortController = controller
    try {
      for await (const event of this.manager.client.textGeneration(modelId, messages, controller.signal)) {
        this.broadcast(event)
      }
    } catch (error) {
      // Aborts are expected (Stop button); other failures surface as an event.
      if (!controller.signal.aborted) {
        this.broadcast({ type: "error", message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      this.abortController = null
    }
  }

  private broadcast(event: TextGenerationEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.textGeneration.event, event)
    }
  }
}
