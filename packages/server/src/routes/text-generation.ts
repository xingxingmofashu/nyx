import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { LLMMessage } from "@nyx/llm"
import { streamTextGeneration } from "../services/text-generation"

/** POST /v1/text-generation — SSE-streamed text generation. */
export const textGenerationRoutes = new Hono()

textGenerationRoutes.post("/", (c) =>
  streamSSE(c, async (stream) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    const message = (body as { message?: string }).message
    if (!model || !message) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "model and message are required" }) })
      return
    }
    const messages: LLMMessage[] = [{ role: "user", content: message }]
    try {
      let full = ""
      for await (const event of streamTextGeneration(model, messages)) {
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
