import { resolve } from "node:path"
import { resolveModelConfig, streamAgent, type ResolvedAgentModel } from "@nyx/agent"
import { getAgentSettings } from "@nyx/config"
import { createAgentTools } from "../lib/agent-tools"
import { createModelTools } from "../lib/model-tools"
import { ProviderCache } from "../lib/provider-cache"
import type { AgentRequest } from "../shared/types"

/**
 * Runs the remote "master brain" agent loop. The brain is a cloud model
 * (resolved from settings), the tools are local coding tools confined to
 * `workspaceDir`. Stateless: each run carries the full transcript, so an
 * approval is answered by re-sending it.
 */
export class AgentService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** Run one agent turn over `request.messages`, returning the UI message stream. */
  async run(request: AgentRequest, signal?: AbortSignal): Promise<Response> {
    const settings = getAgentSettings()

    let model: ResolvedAgentModel
    try {
      model = resolveModelConfig(settings)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
    }

    const workspaceDir = resolve(request.workspaceDir ?? settings.workspaceDir ?? process.cwd())
    const tools = [
      ...createAgentTools(workspaceDir),
      ...(settings.tools?.localModels
        ? createModelTools({ cache: this.cache, workspaceDir, inlineAudio: request.inlineAudio })
        : []),
    ]
    return streamAgent({
      model,
      tools,
      messages: request.messages,
      workspaceDir,
      systemPrompt: settings.systemPrompt,
      maxSteps: settings.maxSteps,
      signal,
    })
  }
}
