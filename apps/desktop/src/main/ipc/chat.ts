import { ipcMain } from "electron"
import { IPC } from "../../preload/ipc.ts"
import type { ChatCompactRequest, ChatSendRequest } from "../../renderer/src/types.ts"
import type { Chat as ChatService } from "../services/chat.ts"

export class Chat {
  static register(service: ChatService): void {
    ipcMain.handle(IPC.chat.send, (_e, request: ChatSendRequest) => service.send(request))
    ipcMain.handle(IPC.chat.abort, (_e, streamId: string) => service.abort(streamId))
    ipcMain.handle(IPC.chat.compact, (_e, request: ChatCompactRequest) => service.compact(request))
  }
}
