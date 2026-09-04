import type { BrowserWindow } from "electron"
import type { ServerManager } from "../server/manager"
import { IPC } from "../../shared/ipc"
import type { ChatEvent, ChatMessage } from "../../shared/types"

/**
 * Bridges the chat tool to the inference server.
 *
 * Stateless proxy: model selection and busy state live in the renderer; each
 * turn passes its model + full transcript. The server's SSE events are
 * forwarded to windows verbatim (delta/end/error).
 */
export class AgentService {
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
  async send(modelId: string, messages: ChatMessage[]): Promise<void> {
    this.abortController = new AbortController()
    try {
      await this.manager.client.chat(
        modelId,
        messages,
        {
          onDelta: (text) => this.broadcast({ type: "delta", text }),
          onEnd: (text) => this.broadcast({ type: "end", text }),
          onError: (message) => this.broadcast({ type: "error", message }),
        },
        this.abortController.signal,
      )
    } finally {
      this.abortController = null
    }
  }

  private broadcast(event: ChatEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.chat.event, event)
    }
  }
}
