import { Hono } from "hono"
import { createUIMessageStream, createUIMessageStreamResponse, isTextUIPart, type UIMessage } from "ai"
import type { LLMMessage } from "@nyx/llm"
import type { TextGenerationService } from "../services/tasks/text-generation"

/** Flatten a UI-message transcript to the `{ role, content }` turns the pipeline wants. */
function toLlmMessages(messages: UIMessage[]): LLMMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join(""),
  }))
}

/**
 * POST /v1/tasks/text-generation — streams a local generation as an AI SDK UI
 * message stream, so clients can use the same `useChat` transport as the agent.
 */
export function textGeneration(service: TextGenerationService): Hono {
  const app = new Hono()

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      model?: string
      messages?: UIMessage[]
    }
    if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: "model and non-empty messages are required" }, 400)
    }

    const model = body.model
    const messages = toLlmMessages(body.messages)
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = "text"
        writer.write({ type: "start" })
        writer.write({ type: "text-start", id })
        try {
          for await (const event of service.stream(model, messages)) {
            if (event.type === "text-delta") writer.write({ type: "text-delta", id, delta: event.delta })
            else throw new Error(event.message)
          }
        } finally {
          writer.write({ type: "text-end", id })
        }
        writer.write({ type: "finish" })
      },
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    })
    return createUIMessageStreamResponse({ stream })
  })

  return app
}
