import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { AgentService } from "../services/agent"
import type { AgentRequest } from "../shared/types"

/** POST /v1/agent — SSE-streamed agent run over a full message transcript. */
export function agent(service: AgentService): Hono {
  const app = new Hono()

  app.post("/", (c) =>
    streamSSE(c, async (stream) => {
      const body = (await c.req.json().catch(() => ({}))) as Partial<AgentRequest>
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ type: "error", message: "non-empty messages are required" }),
        })
        return
      }

      const controller = new AbortController()
      c.req.raw.signal.addEventListener("abort", () => controller.abort())

      try {
        for await (const event of service.stream(body as AgentRequest, controller.signal)) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
        })
      }
    }),
  )

  return app
}
