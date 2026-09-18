import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class TextToSpeech {
  private static readonly route = createRoute({
    method: "post",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.TextToSpeechRequestSchema } }, required: true },
    },
    responses: {
      200: { description: "Generated audio bytes" },
    },
  })

  static create(service: Agent.Services.TextToSpeech) {
    return new OpenAPIHono({ defaultHook: Errors.hook }).openapi(TextToSpeech.route, async (c) => {
      const { model, text, speaker, speed } = c.req.valid("json")
      const result = await service.generate(model, text, {
        ...(speaker ? { speaker } : {}),
        ...(speed !== undefined ? { speed } : {}),
      })
      return c.body(new Uint8Array(result.data), 200, {
        "Content-Type": result.mimeType,
        "X-Audio-Sampling-Rate": String(result.samplingRate),
      })
    })
  }
}
