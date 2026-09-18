import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { validationHook } from "../validation"
import { Agent } from "@nyx/agent"

/** POST /v1/tasks/image-to-image — transform an image; responds with image bytes. */
export function imageToImage(service: Agent.Services.ImageToImage) {
  return new Hono().post("/", zValidator("json", Agent.Services.ImageToImageRequestSchema, validationHook), async (c) => {
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
