import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { auth } from "./middleware/auth"
import { InferenceService } from "./services/inference"
import { textGenerationRoutes } from "./routes/text-generation"
import { imageToImageRoutes } from "./routes/image-to-image"
import { modelsRoutes } from "./routes/models"

/** Assemble the app: auth middleware + mounted v1 routes over one service. */
export function createApp(options: { token?: string; service?: InferenceService } = {}): Hono {
  const app = new Hono()
  const { token } = options
  const service = options.service ?? new InferenceService()

  // Bearer token auth when a token is configured (spawned by the desktop app).
  if (token) {
    app.use("*", auth(token))
  }

  app.get("/v1/health", (c) => c.json({ ok: true }))
  app.route("/v1/models", modelsRoutes(service))
  app.route("/v1/text-generation", textGenerationRoutes(service))
  app.route("/v1/image-to-image", imageToImageRoutes(service))

  return app
}

export interface NyxServerHandle {
  url: string
  port: number
  stop: () => Promise<void>
}

/** Start the inference server; resolves once listening. */
export function startServer(options: { token?: string; port?: number; host?: string; service?: InferenceService } = {}): Promise<NyxServerHandle> {
  const app = createApp({ token: options.token, service: options.service })
  const port = options.port ?? 0 // 0 = OS-assigned ephemeral port
  const host = options.host ?? "127.0.0.1"

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
      const actualPort = typeof info === "object" && info !== null ? info.port : port
      resolve({
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        stop: () =>
          new Promise<void>((res) => {
            server.close(() => res())
          }),
      })
    })
    server.on("error", reject)
  })
}

export * from "./shared/types"
