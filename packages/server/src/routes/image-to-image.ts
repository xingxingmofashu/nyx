import { Hono } from "hono"
import { streamImageToImage } from "../services/image-to-image"
import type { ImageInput } from "../types"

/** POST /v1/image-to-image — transform an image; responds with image bytes. */
export const imageToImageRoutes = new Hono()

imageToImageRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const model = (body as { model?: string }).model
  const image = (body as { image?: ImageInput }).image
  if (!model || !image?.data) return c.json({ error: "model and image are required" }, 400)

  try {
    const result = await streamImageToImage(model, image)
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
