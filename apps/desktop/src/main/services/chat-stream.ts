import type { BrowserWindow } from "electron"
import type { NyxServerProcess } from "../server"
import { IPC } from "../../shared/ipc"
import type { ChatSendRequest, ChatStreamEvent } from "../../shared/types"

/**
 * Stateless proxy for the master-brain agent chat. Each stream is identified by
 * a renderer-generated id so chunks can be routed back to the right `useChat`
 * transport and aborted individually.
 */
export class ChatStreamService {
  private readonly manager: NyxServerProcess
  private windows = new Set<BrowserWindow>()
  private controllers = new Map<string, AbortController>()

  constructor(manager: NyxServerProcess) {
    this.manager = manager
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  /** Abort one in-flight stream by its renderer-generated id. */
  abort(streamId: string): void {
    this.controllers.get(streamId)?.abort()
  }

  /** Start a stream; chunks are pushed to all attached windows until it ends. */
  async send({ streamId, body }: ChatSendRequest): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(streamId, controller)
    try {
      for await (const chunk of this.manager.client.agent(body, controller.signal)) {
        this.broadcast({ type: "chunk", streamId, chunk })
      }
      this.broadcast({ type: "end", streamId })
    } catch (error) {
      // A user-initiated abort (Stop) is expected and simply closes the stream.
      if (controller.signal.aborted) {
        this.broadcast({ type: "end", streamId })
      } else {
        this.broadcast({
          type: "error",
          streamId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      this.controllers.delete(streamId)
    }
  }

  private broadcast(event: ChatStreamEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.chat.event, event)
    }
  }
}
