import * as appModule from "./app.ts"
import * as ipcModule from "./ipc/index.ts"
import * as serverModule from "./server.ts"
import * as chatModule from "./services/chat.ts"
import * as modelsModule from "./services/models.ts"
import * as knowledgeModule from "./services/knowledge.ts"

export namespace Main {
  export import App = appModule.App
  export import Ipc = ipcModule.Ipc
  export import Server = serverModule.NyxServer
  export import PullCancelledError = serverModule.PullCancelledError
  export import IndexCancelledError = serverModule.IndexCancelledError

  export namespace Services {
    export import Chat = chatModule.Chat
    export import Models = modelsModule.Models
    export import Knowledge = knowledgeModule.Knowledge
  }
}
