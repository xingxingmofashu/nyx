import type { BrowserWindow } from "electron"
import type { ServerManager } from "../server/manager"
import { IPC } from "../../shared/ipc"
import type { ChatEvent } from "../../shared/types"

/**
 * Bridges the chat tool to the inference server.
 *
 * Streaming events from the server's SSE stream are forwarded to the
 * renderer as serialized ChatEvents.
 */
export class AgentService {
  private readonly manager: ServerManager
  private modelId = ""
  private windows = new Set<BrowserWindow>()
  private busy = false
  private abortController: AbortController | null = null

  constructor(manager: ServerManager) {
    this.manager = manager
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  get currentModel(): string {
    return this.modelId
  }

  get isBusy(): boolean {
    return this.busy
  }

  setModel(modelId: string): void {
    this.modelId = modelId
  }

  abort(): void {
    this.abortController?.abort()
  }

  /** Start a streaming chat; SSE events are pushed to attached windows. */
  async send(text: string): Promise<void> {
    if (!this.modelId) throw new Error("No text-generation model selected. Pick a model first.")
    if (this.busy) return
    this.busy = true
    this.abortController = new AbortController()
    this.broadcast({ type: "message_start", role: "assistant" })
    try {
      await this.manager.client.chat(
        this.modelId,
        text,
        {
          onDelta: (delta) => this.broadcast({ type: "message_update", text: delta }),
          onEnd: (fullText) => this.broadcast({ type: "message_end", text: fullText }),
          onError: (message) => this.broadcast({ type: "agent_error", message }),
        },
        this.abortController.signal,
      )
    } finally {
      this.busy = false
      this.abortController = null
    }
  }

  private broadcast(event: ChatEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.chat.event, event)
    }
  }
}
