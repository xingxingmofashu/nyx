import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { safeValidateUIMessages } from "ai"
import { AgentRequestSchema, type AgentRequest } from "../shared/types"
import { validationHook } from "../lib/validation"
import type { AgentService } from "../services/agent"

/**
 * POST /v1/agent — runs the agent and returns the AI SDK UI message stream
 * (SSE), so clients can drive it with `useChat` / `readUIMessageStream`.
 */
export function agent(service: AgentService) {
  return new Hono().post("/", zValidator("json", AgentRequestSchema, validationHook), async (c) => {
    const { messages, workspaceDir, sessionId, inlineAudio } = c.req.valid("json")

    const validated = await safeValidateUIMessages({ messages })
    if (!validated.success) {
      return c.json({ error: validated.error.message }, 400)
    }

    const controller = new AbortController()
    c.req.raw.signal.addEventListener("abort", () => controller.abort())

    try {
      const request: AgentRequest = {
        messages: validated.data,
        ...(workspaceDir !== undefined ? { workspaceDir } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(inlineAudio !== undefined ? { inlineAudio } : {}),
      }
      return await service.run(request, controller.signal)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })
}
