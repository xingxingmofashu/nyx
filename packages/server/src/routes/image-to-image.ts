import { Hono } from "hono"
import type { InferenceService } from "../services/inference"
import type { ImageInput } from "../shared/types"

/** POST /v1/image-to-image — transform an image; responds with image bytes. */
export function imageToImageRoutes(service: InferenceService): Hono {
  const app = new Hono()

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    const image = (body as { image?: ImageInput }).image
    if (!model || !image?.data) return c.json({ error: "model and image are required" }, 400)

    try {
      const result = await service.imageToImage(model, image)
      return c.body(new Uint8Array(result.data), 200, {
        "Content-Type": "application/octet-stream",
        "X-Image-Width": String(result.width),
        "X-Image-Height": String(result.height),
        "X-Image-Channels": String(result.channels),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  return app
}
