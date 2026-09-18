import type { BrowserWindow } from "electron"
import type { NyxServer } from "../server.ts"
import { IPC } from "../../preload/ipc.ts"
import type { ChatCompactRequest, ChatSendRequest, ChatStreamEvent, CompactionResult } from "../../renderer/src/types.ts"

export class Chat {
  private windows = new Set<BrowserWindow>()
  private controllers = new Map<string, AbortController>()

  constructor(private readonly server: NyxServer) {}

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  abort(streamId: string): void {
    this.controllers.get(streamId)?.abort()
  }

  compact(request: ChatCompactRequest): Promise<CompactionResult> {
    return this.server.agentCompact({ ...request })
  }

  async send({ streamId, body }: ChatSendRequest): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(streamId, controller)
    try {
      for await (const chunk of this.server.agent(body, controller.signal)) {
        this.broadcast({ type: "chunk", streamId, chunk })
      }
      this.broadcast({ type: "end", streamId })
    } catch (error) {
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
