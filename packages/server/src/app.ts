import { serve } from "@hono/node-server"
import { $, OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
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
  private static readonly MAX_BODY_BYTES = 32 * 1024 * 1024

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

    const api = new OpenAPIHono({ defaultHook: Errors.hook })
    api.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
      type: "http",
      scheme: "bearer",
    })
    const v1 = $(
      api
        .use("*", Auth.middleware(options.token))
        .use(
          "*",
          bodyLimit({
            maxSize: App.MAX_BODY_BYTES,
            onError: (c) => c.json({ error: "Request body too large" }, 413),
          }),
        ),
    )
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
                const closing = server as { closeAllConnections?: () => void }
                closing.closeAllConnections?.()
              }),
          })
        },
      )
      server.on("error", reject)
    })
  }
}
