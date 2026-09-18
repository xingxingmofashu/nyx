import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { safeValidateUIMessages } from "ai"
import { validationHook } from "../validation"
import { Agent } from "@nyx/agent"

/**
 * POST /v1/agent — runs the agent and returns the AI SDK UI message stream
 * (SSE), so clients can drive it with `useChat` / `readUIMessageStream`.
 * POST /v1/agent/compact — summarizes the transcript right away (no turn) and
 * returns the checkpoint; the client persists it as message metadata.
 */
export function agent(service: Agent.Services.Agent) {
  return new Hono()
    .post("/", zValidator("json", Agent.Services.AgentRequestSchema, validationHook), async (c) => {
      const { messages, workspaceDir, sessionId, inlineAudio, forceCompact } = c.req.valid("json")

      const validated = await safeValidateUIMessages({ messages })
      if (!validated.success) {
        return c.json({ error: validated.error.message }, 400)
      }

      const controller = new AbortController()
      c.req.raw.signal.addEventListener("abort", () => controller.abort())

      try {
        const request: Agent.Services.AgentRequest = {
          messages: validated.data,
          ...(workspaceDir !== undefined ? { workspaceDir } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(inlineAudio !== undefined ? { inlineAudio } : {}),
          ...(forceCompact !== undefined ? { forceCompact } : {}),
        }
        return await service.run(request, controller.signal)
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
      }
    })
    .post("/compact", zValidator("json", Agent.Services.CompactRequestSchema, validationHook), async (c) => {
      const { messages, workspaceDir, sessionId } = c.req.valid("json")

      const validated = await safeValidateUIMessages({ messages })
      if (!validated.success) {
        return c.json({ error: validated.error.message }, 400)
      }

      try {
        const request: Agent.Services.CompactRequest = {
          messages: validated.data,
          ...(workspaceDir !== undefined ? { workspaceDir } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
        }
        return c.json(await service.compact(request))
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
      }
    })
}
