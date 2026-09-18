import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class TextToSpeech {
  static create(service: Agent.Services.TextToSpeech) {
    return new Hono().post(
      "/",
      zValidator("json", Agent.Services.TextToSpeechRequestSchema, Errors.hook),
      async (c) => {
        const { model, text, speaker, speed } = c.req.valid("json")
        const result = await service.generate(model, text, {
          ...(speaker ? { speaker } : {}),
          ...(speed !== undefined ? { speed } : {}),
        })
        return c.body(new Uint8Array(result.data), 200, {
          "Content-Type": result.mimeType,
          "X-Audio-Sampling-Rate": String(result.samplingRate),
        })
      },
    )
  }
}
