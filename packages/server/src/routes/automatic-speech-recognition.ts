import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class AutomaticSpeechRecognition {
  static create(service: Agent.Services.AutomaticSpeechRecognition) {
    return new Hono().post(
      "/",
      zValidator("json", Agent.Services.AutomaticSpeechRecognitionRequestSchema, Errors.hook),
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
        return c.json({ text })
      },
    )
  }
}
