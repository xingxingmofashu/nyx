import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { InferenceService } from "../services/inference"
import type { ChatMessage } from "../shared/types"

/** POST /v1/text-generation — SSE-streamed text generation over a transcript. */
export function textGenerationRoutes(service: InferenceService): Hono {
  const app = new Hono()

  app.post("/", (c) =>
    streamSSE(c, async (stream) => {
      const body = await c.req.json().catch(() => ({}))
      const model = (body as { model?: string }).model
      const messages = (body as { messages?: ChatMessage[] }).messages

      if (!model || !Array.isArray(messages) || messages.length === 0) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: "model and non-empty messages are required" }),
        })
        return
      }

      try {
        let full = ""
        for await (const event of service.streamTextGeneration(model, messages)) {
          if (event.type === "text-delta") {
            full += event.delta
            await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: event.delta }) })
          } else {
            await stream.writeSSE({ event: "error", data: JSON.stringify({ message: event.message }) })
            return
          }
        }
        await stream.writeSSE({ event: "end", data: JSON.stringify({ text: full }) })
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
        })
      }
    }),
  )

  return app
}
