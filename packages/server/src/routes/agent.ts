import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { safeValidateUIMessages, type UIMessage } from "ai"
import { Agent as AgentApi } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class Agent {
  private static readonly runRoute = createRoute({
    method: "post",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: AgentApi.Services.AgentRequestSchema } }, required: true },
    },
    responses: {
      200: { description: "Server-sent stream of AI SDK UI message chunks" },
    },
  })

  private static readonly compactRoute = createRoute({
    method: "post",
    path: "/compact",
    request: {
      body: { content: { "application/json": { schema: AgentApi.Services.CompactRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: AgentApi.Services.CompactResponseSchema } },
        description: "Summary of the compaction",
      },
    },
  })

  static create(service: AgentApi.Services.Agent) {
    return new OpenAPIHono({ defaultHook: Errors.hook })
      .openapi(Agent.runRoute, async (c) => {
        const { messages, workspaceDir, sessionId, inlineAudio, forceCompact, allowAll, revoke } = c.req.valid("json")
        const validated = await Agent.validate(messages)

        const controller = new AbortController()
        c.req.raw.signal.addEventListener("abort", () => controller.abort())

        const request: AgentApi.Services.AgentRequest = {
          messages: validated,
          workspaceDir,
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(inlineAudio !== undefined ? { inlineAudio } : {}),
          ...(forceCompact !== undefined ? { forceCompact } : {}),
          ...(allowAll !== undefined ? { allowAll } : {}),
          ...(revoke !== undefined ? { revoke } : {}),
        }
        return service.run(request, controller.signal)
      })
      .openapi(Agent.compactRoute, async (c) => {
        const { messages, workspaceDir, sessionId } = c.req.valid("json")
        const validated = await Agent.validate(messages)

        const request: AgentApi.Services.CompactRequest = {
          messages: validated,
          workspaceDir,
          ...(sessionId !== undefined ? { sessionId } : {}),
        }
        return c.json(await service.compact(request, c.req.raw.signal), 200)
      })
  }

  private static async validate(messages: unknown[]): Promise<UIMessage[]> {
    const validated = await safeValidateUIMessages({ messages })
    if (!validated.success) throw Errors.status(400, validated.error)
    return validated.data
  }
}
