import { serve } from "@hono/node-server"
import { $, OpenAPIHono } from "@hono/zod-openapi"
import { HTTPException } from "hono/http-exception"
import { Agent } from "@nyx/agent"
import { Auth } from "./middleware/auth.ts"
import { Errors } from "./errors.ts"
import { Agent as AgentRoute } from "./routes/agent.ts"
import { Files } from "./routes/files.ts"
import { Health } from "./routes/health.ts"
import { Knowledge } from "./routes/knowledge.ts"
import { Models } from "./routes/models.ts"
import { Sessions } from "./routes/sessions.ts"
import { Settings } from "./routes/settings.ts"
import { AutomaticSpeechRecognition } from "./routes/tasks/automatic-speech-recognition.ts"
import { ImageToImage } from "./routes/tasks/image-to-image.ts"
import { TextToSpeech } from "./routes/tasks/text-to-speech.ts"

export interface Services {
  models: Agent.Services.Models
  imageToImage: Agent.Services.ImageToImage
  textToSpeech: Agent.Services.TextToSpeech
  automaticSpeechRecognition: Agent.Services.AutomaticSpeechRecognition
  knowledge: Agent.Services.Knowledge
  agent: Agent.Services.Agent
}

export interface AppOptions {
  token: string
  onLog: (message: string) => void
}

export interface ServeOptions extends AppOptions {
  port?: number
  host?: string
}

export interface Handle {
  url: string
  port: number
  stop: () => Promise<void>
}

export class App {
  static create(options: AppOptions) {
    const cache = new Agent.Provider()
    const knowledge = new Agent.Services.Knowledge(options.onLog)
    const services: Services = {
      models: new Agent.Services.Models(cache),
      imageToImage: new Agent.Services.ImageToImage(cache),
      textToSpeech: new Agent.Services.TextToSpeech(cache),
      automaticSpeechRecognition: new Agent.Services.AutomaticSpeechRecognition(cache),
      knowledge,
      agent: new Agent.Services.Agent(cache, knowledge),
    }

    const v1 = $(new OpenAPIHono({ defaultHook: Errors.hook }).use("*", Auth.middleware(options.token)))
      .onError((error, c) =>
        c.json({ error: Errors.message(error) }, error instanceof HTTPException ? error.status : 500),
      )
      .route("/health", Health.create())
      .route("/settings", Settings.create())
      .route("/sessions", Sessions.create())
      .route("/files", Files.create())
      .route("/models", Models.create(services.models))
      .route("/tasks/image-to-image", ImageToImage.create(services.imageToImage))
      .route("/tasks/text-to-speech", TextToSpeech.create(services.textToSpeech))
      .route(
        "/tasks/automatic-speech-recognition",
        AutomaticSpeechRecognition.create(services.automaticSpeechRecognition),
      )
      .route("/agent", AgentRoute.create(services.agent))
      .route("/knowledge", Knowledge.create(services.knowledge))

    return new OpenAPIHono().route("/v1", v1)
  }

  static serve(options: ServeOptions): Promise<Handle> {
    const app = App.create(options)
    const port = options.port ?? 0
    const host = options.host ?? "127.0.0.1"

    return new Promise((resolve, reject) => {
      const server = serve(
        { fetch: app.fetch, port, hostname: host, overrideGlobalObjects: false },
        (info) => {
          const actualPort = typeof info === "object" && info !== null ? info.port : port
          resolve({
            url: `http://${host}:${actualPort}`,
            port: actualPort,
            stop: () =>
              new Promise<void>((res) => {
                server.close(() => res())
              }),
          })
        },
      )
      server.on("error", reject)
    })
  }
}
