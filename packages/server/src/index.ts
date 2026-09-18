import * as appModule from "./app.ts"
import * as authModule from "./middleware/auth.ts"
import * as errorsModule from "./errors.ts"
import * as agentRouteModule from "./routes/agent.ts"
import * as automaticSpeechRecognitionRouteModule from "./routes/automatic-speech-recognition.ts"
import * as environmentRouteModule from "./routes/environment.ts"
import * as filesRouteModule from "./routes/files.ts"
import * as healthRouteModule from "./routes/health.ts"
import * as imageToImageRouteModule from "./routes/image-to-image.ts"
import * as knowledgeRouteModule from "./routes/knowledge.ts"
import * as modelsRouteModule from "./routes/models.ts"
import * as sessionsRouteModule from "./routes/sessions.ts"
import * as settingsRouteModule from "./routes/settings.ts"
import * as textToSpeechRouteModule from "./routes/text-to-speech.ts"

export namespace Server {
  export import App = appModule.App
  export import Errors = errorsModule.Errors

  export type AppType = ReturnType<typeof appModule.App.create>
  export type Services = appModule.Services
  export type Handle = appModule.Handle
  export type AppOptions = appModule.AppOptions
  export type ServeOptions = appModule.ServeOptions

  export namespace Middleware {
    export import Auth = authModule.Auth
  }

  export namespace Routes {
    export import Agent = agentRouteModule.Agent
    export import AutomaticSpeechRecognition = automaticSpeechRecognitionRouteModule.AutomaticSpeechRecognition
    export import Environment = environmentRouteModule.Environment
    export import Files = filesRouteModule.Files
    export import Health = healthRouteModule.Health
    export import ImageToImage = imageToImageRouteModule.ImageToImage
    export import Knowledge = knowledgeRouteModule.Knowledge
    export import Models = modelsRouteModule.Models
    export import Sessions = sessionsRouteModule.Sessions
    export import Settings = settingsRouteModule.Settings
    export import TextToSpeech = textToSpeechRouteModule.TextToSpeech
  }
}
