import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { TextToSpeechRequestSchema } from "../shared/types"
import { validationHook } from "../lib/validation"
import type { TextToSpeechService } from "../services/tasks/text-to-speech"

/** POST /v1/tasks/text-to-speech — synthesize speech; responds with WAV bytes. */
export function textToSpeech(service: TextToSpeechService) {
  return new Hono().post("/", zValidator("json", TextToSpeechRequestSchema, validationHook), async (c) => {
    const { model, text, speaker, speed } = c.req.valid("json")
    try {
      const result = await service.generate(model, text, {
        ...(speaker ? { speaker } : {}),
        ...(speed !== undefined ? { speed } : {}),
      })
      return c.body(new Uint8Array(result.data), 200, {
        "Content-Type": result.mimeType,
        "X-Audio-Sampling-Rate": String(result.samplingRate),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })
}
