import { IPC } from "../../preload/ipc.ts"
import type { ChatCompactRequest, ChatSendRequest } from "../../renderer/src/types.ts"
import type { Chat as ChatService } from "../services/chat.ts"
import { Guard } from "./guard.ts"

export class Chat {
  static register(service: ChatService): void {
    Guard.handle(IPC.chat.send, (_e, request: ChatSendRequest) => service.send(request))
    Guard.handle(IPC.chat.abort, (_e, streamId: string) => service.abort(streamId))
    Guard.handle(IPC.chat.compact, (_e, request: ChatCompactRequest) => service.compact(request))
  }
}
