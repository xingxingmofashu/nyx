import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class AutomaticSpeechRecognition {
  private static readonly route = createRoute({
    method: "post",
    path: "/",
    request: {
      body: {
        content: { "application/json": { schema: Agent.Services.AutomaticSpeechRecognitionRequestSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Agent.Services.TranscriptResultSchema } },
        description: "Transcribed text",
      },
    },
  })

  static create(service: Agent.Services.AutomaticSpeechRecognition) {
    return new OpenAPIHono({ defaultHook: Errors.hook }).openapi(
      AutomaticSpeechRecognition.route,
      async (c) => {
        const { model, audio, language, task } = c.req.valid("json")
        const bytes = Buffer.from(audio.data, "base64")
        const byteLength = bytes.byteLength - (bytes.byteLength % 4)
        const samples = new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + byteLength),
        )
        const text = await service.transcribe(model, samples, audio.samplingRate, {
          ...(language ? { language } : {}),
          ...(task ? { task } : {}),
        })
        return c.json({ text }, 200)
      },
    )
  }
}
