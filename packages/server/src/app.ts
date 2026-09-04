import { Hono } from "hono"
import { auth } from "./middleware/auth"
import { imageToImage } from "./routes/image-to-image"
import { models } from "./routes/models"
import { textGeneration } from "./routes/text-generation"
import { InferenceService } from "./services/inference"

/**
 * The versioned API group (`/v1`). Hono grouping: each resource is its own
 * sub-app (see routes/*) and is mounted under this group, which carries the
 * auth middleware + the shared health route once. Mounted on the root app in
 * `createApp`.
 */
export function v1(options: { token?: string; service: InferenceService }): Hono {
  const v1 = new Hono()

  // Bearer token auth guards the whole API group (spawned by the desktop app).
  if (options.token) {
    v1.use("*", auth(options.token))
  }

  v1.get("/health", (c) => c.json({ ok: true }))
  v1.route("/models", models(options.service))
  v1.route("/text-generation", textGeneration(options.service))
  v1.route("/image-to-image", imageToImage(options.service))

  return v1
}

/** Assemble the root app: a single mounted /v1 group over one service. */
export function createApp(options: { token?: string; service?: InferenceService } = {}): Hono {
  const service = options.service ?? new InferenceService()
  const app = new Hono()
  app.route("/v1", v1({ token: options.token, service }))
  return app
}
