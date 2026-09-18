import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { Agent } from "@nyx/agent"
import { Errors } from "../../errors.ts"

export class ImageToImage {
  private static readonly route = createRoute({
    method: "post",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.ImageToImageRequestSchema } }, required: true },
    },
    responses: {
      200: { description: "Generated image bytes" },
    },
  })

  static create(service: Agent.Services.ImageToImage) {
    return new OpenAPIHono({ defaultHook: Errors.hook }).openapi(ImageToImage.route, async (c) => {
      const { model, image } = c.req.valid("json")
      const result = await service.generate(model, image)
      return c.body(new Uint8Array(result.data), 200, {
        "Content-Type": result.mimeType,
        "X-Image-Width": String(result.width),
        "X-Image-Height": String(result.height),
        "X-Image-Channels": String(result.channels),
      })
    })
  }
}
