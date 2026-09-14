import { Hono } from "hono"
import type { AgentService } from "../services/agent"
import type { AgentRequest } from "../shared/types"

/**
 * POST /v1/agent — runs the agent and returns the AI SDK UI message stream
 * (SSE), so clients can drive it with `useChat` / `readUIMessageStream`.
 */
export function agent(service: AgentService): Hono {
  const app = new Hono()

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<AgentRequest>
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: "non-empty messages are required" }, 400)
    }

    const controller = new AbortController()
    c.req.raw.signal.addEventListener("abort", () => controller.abort())

    try {
      return await service.run(body as AgentRequest, controller.signal)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  return app
}
