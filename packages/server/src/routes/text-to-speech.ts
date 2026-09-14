import { Hono } from "hono"
import type { TextToSpeechService } from "../services/tasks/text-to-speech"
import type { TextToSpeechInput } from "../shared/types"

/** POST /v1/tasks/text-to-speech — synthesize speech; responds with WAV bytes. */
export function textToSpeech(service: TextToSpeechService): Hono {
  const app = new Hono()

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    const input = body as TextToSpeechInput
    if (!model || !input.text?.trim()) return c.json({ error: "model and text are required" }, 400)

    try {
      const result = await service.generate(model, input.text, {
        ...(input.speaker ? { speaker: input.speaker } : {}),
        ...(typeof input.speed === "number" ? { speed: input.speed } : {}),
      })
      return c.body(new Uint8Array(result.data), 200, {
        "Content-Type": result.mimeType,
        "X-Audio-Sampling-Rate": String(result.samplingRate),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  return app
}
