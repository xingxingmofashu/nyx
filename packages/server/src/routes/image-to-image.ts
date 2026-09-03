import { Hono } from "hono"
import { runImageToImage } from "../services/image-to-image"
import type { ImageInput } from "../types"

/** POST /v1/image-to-image — transform an image (base64 in/out). */
export const imageToImageRoutes = new Hono()

imageToImageRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const model = (body as { model?: string }).model
  const image = (body as { image?: ImageInput }).image
  if (!model || !image?.data) return c.json({ error: "model and image are required" }, 400)
  try {
    const result = await runImageToImage(model, image)
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
