import { Hono } from "hono"
import { auth } from "./middleware/auth"
import { imageToImage } from "./routes/image-to-image"
import { models } from "./routes/models"
import { textGeneration } from "./routes/text-generation"
import { InferenceService } from "./services/inference"
import { ModelStore } from "./services/model-store"
import { ProviderCache } from "./services/provider-cache"

/** Service dependencies shared by every route, wired once per app instance. */
export interface Services {
  /** Runs text-generation and image-to-image inference. */
  inference: InferenceService
  /** Manages the model cache: list, pull, cancel, remove. */
  models: ModelStore
}

/** Assemble a fully-wired app: mount services under `/v1`. */
export function createApp(options: { token?: string; services?: Services } = {}): Hono {
  // Share one provider cache between inference and the model store so removing
  // a model also evicts its loaded weights.
  const cache = new ProviderCache()
  const services: Services = options.services ?? {
    inference: new InferenceService(cache),
    models: new ModelStore(cache),
  }

  const v1 = new Hono()
  if (options.token) {
    v1.use("*", auth(options.token))
  }
  v1.get("/health", (c) => c.json({ ok: true }))

  v1.route("/models", models(services.models))
  v1.route("/text-generation", textGeneration(services.inference))
  v1.route("/image-to-image", imageToImage(services.inference))

  const app = new Hono()
  app.route("/v1", v1)
  return app
}
