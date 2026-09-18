import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class ImageToImage {
  static create(service: Agent.Services.ImageToImage) {
    return new Hono().post(
      "/",
      zValidator("json", Agent.Services.ImageToImageRequestSchema, Errors.hook),
      async (c) => {
        const { model, image } = c.req.valid("json")
        const result = await service.generate(model, image)
        return c.body(new Uint8Array(result.data), 200, {
          "Content-Type": result.mimeType,
          "X-Image-Width": String(result.width),
          "X-Image-Height": String(result.height),
          "X-Image-Channels": String(result.channels),
        })
      },
    )
  }
}
