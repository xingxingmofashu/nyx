import { Hono } from "hono"
import { auth } from "./middleware/auth"
import { imageToImage } from "./routes/image-to-image"
import { models } from "./routes/models"
import { textGeneration } from "./routes/text-generation"
import { InferenceService } from "./services/inference"

/**
 * The versioned `/v1` API group: auth + health once, resource sub-apps mounted
 * below. Each resource is its own stateless sub-app factory.
 */
export function v1(options: { token?: string; service: InferenceService }): Hono {
  const v1 = new Hono()

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
