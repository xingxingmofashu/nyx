import { Hono } from "hono"
import type { AutomaticSpeechRecognitionService } from "../services/tasks/automatic-speech-recognition"
import type { AutomaticSpeechRecognitionInput } from "../shared/types"

/** POST /v1/tasks/automatic-speech-recognition — transcribe PCM samples; responds with JSON text. */
export function automaticSpeechRecognition(service: AutomaticSpeechRecognitionService): Hono {
  const app = new Hono()

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<AutomaticSpeechRecognitionInput> & { model?: string }
    const model = body.model
    const audio = body.audio
    if (typeof model !== "string" || !model || !audio?.data || typeof audio.samplingRate !== "number") {
      return c.json({ error: "model and audio { data, samplingRate } are required" }, 400)
    }

    try {
      // Copy into a fresh, 4-byte-aligned buffer: base64-decoded Buffers may sit
      // at an arbitrary offset inside the shared pool.
      const bytes = Buffer.from(audio.data, "base64")
      const byteLength = bytes.byteLength - (bytes.byteLength % 4)
      const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + byteLength))
      const text = await service.transcribe(model, samples, audio.samplingRate, {
        ...(body.language ? { language: body.language } : {}),
        ...(body.task ? { task: body.task } : {}),
      })
      return c.json({ text })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  return app
}
