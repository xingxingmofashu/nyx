import { Hono } from "hono"
import { auth } from "./middleware/auth"
import { imageToImage } from "./routes/image-to-image"
import { models } from "./routes/models"
import { textGeneration } from "./routes/text-generation"
import { ImageToImageService } from "./services/image-to-image"
import { ModelsService } from "./services/models"
import { TextGenerationService } from "./services/text-generation"
import { ProviderCache } from "./lib/provider-cache"

/** Service dependencies shared by every route, wired once per app instance. */
export interface Services {
  /** Downloads/removes models: list, pull, cancel, remove. */
  models: ModelsService
  /** Streams text-generation turns. */
  textGeneration: TextGenerationService
  /** Runs image-to-image transforms. */
  imageToImage: ImageToImageService
}

/** Assemble a fully-wired app: mount services under `/v1`. */
export function createApp(options: { token?: string; services?: Services } = {}): Hono {
  // Share one provider cache between the task services and the model service so
  // removing a model also evicts its loaded weights.
  const cache = new ProviderCache()
  const services: Services = options.services ?? {
    models: new ModelsService(cache),
    textGeneration: new TextGenerationService(cache),
    imageToImage: new ImageToImageService(cache),
  }

  const v1 = new Hono()
  if (options.token) {
    v1.use("*", auth(options.token))
  }
  v1.get("/health", (c) => c.json({ ok: true }))

  v1.route("/models", models(services.models))
  v1.route("/text-generation", textGeneration(services.textGeneration))
  v1.route("/image-to-image", imageToImage(services.imageToImage))

  const app = new Hono()
  app.route("/v1", v1)
  return app
}
