import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { AutomaticSpeechRecognitionRequestSchema } from "../schema"
import { validationHook } from "../validation"
import type { AutomaticSpeechRecognitionService } from "../services/tasks/automatic-speech-recognition"

/** POST /v1/tasks/automatic-speech-recognition — transcribe PCM samples; responds with JSON text. */
export function automaticSpeechRecognition(service: AutomaticSpeechRecognitionService) {
  return new Hono().post("/", zValidator("json", AutomaticSpeechRecognitionRequestSchema, validationHook), async (c) => {
    const { model, audio, language, task } = c.req.valid("json")
    try {
      // Copy into a fresh, 4-byte-aligned buffer: base64-decoded Buffers may sit
      // at an arbitrary offset inside the shared pool.
      const bytes = Buffer.from(audio.data, "base64")
      const byteLength = bytes.byteLength - (bytes.byteLength % 4)
      const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + byteLength))
      const text = await service.transcribe(model, samples, audio.samplingRate, {
        ...(language ? { language } : {}),
        ...(task ? { task } : {}),
      })
      return c.json({ text })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })
}
