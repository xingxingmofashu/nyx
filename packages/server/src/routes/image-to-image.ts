import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { ImageToImageRequestSchema } from "../shared/types"
import { validationHook } from "../lib/validation"
import type { ImageToImageService } from "../services/tasks/image-to-image"

/** POST /v1/tasks/image-to-image — transform an image; responds with image bytes. */
export function imageToImage(service: ImageToImageService) {
  return new Hono().post("/", zValidator("json", ImageToImageRequestSchema, validationHook), async (c) => {
    const { model, image } = c.req.valid("json")
    try {
      const result = await service.generate(model, image)
      return c.body(new Uint8Array(result.data), 200, {
        "Content-Type": result.mimeType,
        "X-Image-Width": String(result.width),
        "X-Image-Height": String(result.height),
        "X-Image-Channels": String(result.channels),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })
}
