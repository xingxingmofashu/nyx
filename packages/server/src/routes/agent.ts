import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { safeValidateUIMessages, type UIMessage } from "ai"
import { Agent as AgentApi } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class Agent {
  static create(service: AgentApi.Services.Agent) {
    return new Hono()
      .post("/", zValidator("json", AgentApi.Services.AgentRequestSchema, Errors.hook), async (c) => {
        const { messages, workspaceDir, sessionId, inlineAudio, forceCompact } = c.req.valid("json")
        const validated = await Agent.validate(messages)

        const controller = new AbortController()
        c.req.raw.signal.addEventListener("abort", () => controller.abort())

        const request: AgentApi.Services.AgentRequest = {
          messages: validated,
          ...(workspaceDir !== undefined ? { workspaceDir } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(inlineAudio !== undefined ? { inlineAudio } : {}),
          ...(forceCompact !== undefined ? { forceCompact } : {}),
        }
        return service.run(request, controller.signal)
      })
      .post("/compact", zValidator("json", AgentApi.Services.CompactRequestSchema, Errors.hook), async (c) => {
        const { messages, workspaceDir, sessionId } = c.req.valid("json")
        const validated = await Agent.validate(messages)

        const request: AgentApi.Services.CompactRequest = {
          messages: validated,
          ...(workspaceDir !== undefined ? { workspaceDir } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
        }
        return c.json(await service.compact(request))
      })
  }

  private static async validate(messages: unknown[]): Promise<UIMessage[]> {
    const validated = await safeValidateUIMessages({ messages })
    if (!validated.success) throw Errors.status(400, validated.error)
    return validated.data
  }
}
