import type { Chat as ChatService } from "../services/chat.ts"
import type { Knowledge as KnowledgeService } from "../services/knowledge.ts"
import type { Models as ModelsService } from "../services/models.ts"
import type { NyxServer } from "../server.ts"
import { Chat } from "./chat.ts"
import { Config } from "./config.ts"
import { Dialog } from "./dialog.ts"
import { Files } from "./files.ts"
import { Knowledge } from "./knowledge.ts"
import { Models } from "./models.ts"
import { Sessions } from "./sessions.ts"
import { Tasks } from "./tasks.ts"
import { Window } from "./window.ts"

export interface Services {
  chat: ChatService
  models: ModelsService
  knowledge: KnowledgeService
  server: NyxServer
}

export class Ipc {
  static register(services: Services): void {
    Tasks.register(services.server)
    Chat.register(services.chat)
    Models.register(services.models)
    Knowledge.register(services.knowledge)
    Config.register(services.server)
    Sessions.register(services.server)
    Dialog.register()
    Files.register(services.server)
    Window.register()
  }
}
