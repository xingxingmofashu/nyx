import { resolve } from "node:path"
import type { ToolSet } from "ai"
import { Provider } from "../provider.ts"
import { streamAgent } from "../agent.ts"
import type { ResolvedAgentModel } from "../types.ts"
import { getAgentSettings } from "@nyx/config"
import { withAttachmentNotes } from "../attachment"
import { createAgentTools, createKnowledgeTools, createModelTools, createWebTools, toolApproval } from "../tools/index.ts"
import { KnowledgeService } from "./knowledge"
import type { AgentRequest } from "../schema"

/**
 * Runs the remote "master brain" agent loop. The brain is a cloud model
 * (resolved from settings), the tools are local coding tools confined to
 * `workspaceDir`. Stateless: each run carries the full transcript, so an
 * approval is answered by re-sending it.
 */
export class AgentService {
  constructor(
    private readonly cache: Provider = new Provider(),
    private readonly knowledge: KnowledgeService = new KnowledgeService(),
  ) {}

  /** Run one agent turn over `request.messages`, returning the UI message stream. */
  async run(request: AgentRequest, signal?: AbortSignal): Promise<Response> {
    const settings = getAgentSettings()

    let model: ResolvedAgentModel
    try {
      model = Provider.resolveModelConfig(settings)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
    }

    const workspaceDir = resolve(request.workspaceDir ?? settings.workspaceDir ?? process.cwd())
    const tools: ToolSet = {
      ...createAgentTools(workspaceDir),
      ...(settings.tools?.localModels === false
        ? {}
        : createModelTools({
            cache: this.cache,
            workspaceDir,
            sessionId: request.sessionId,
            inlineAudio: request.inlineAudio,
          })),
      ...(settings.tools?.knowledge === false ? {} : createKnowledgeTools(this.knowledge)),
      ...(settings.tools?.webSearch === false ? {} : createWebTools({ sessionId: request.sessionId })),
    }
    return streamAgent({
      model,
      tools,
      toolApproval,
      messages: withAttachmentNotes(request.messages),
      systemPrompt: settings.systemPrompt,
      maxSteps: settings.maxSteps,
      signal,
    })
  }
}
