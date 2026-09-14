import { resolve } from "node:path"
import { resolveModelConfig, streamAgent, type AgentEvent, type ResolvedAgentModel } from "@nyx/agent"
import { getAgentSettings } from "@nyx/config"
import { createAgentTools } from "../lib/agent-tools"
import type { AgentRequest } from "../shared/types"

/**
 * Runs the remote "master brain" agent loop. The brain is a cloud model
 * (resolved from settings), the tools are local coding tools confined to
 * `workspaceDir`. Stateless: each run carries the full transcript, so an
 * approval is answered by re-sending it.
 */
export class AgentService {
  /** Stream one agent run over `request.messages`. */
  async *stream(request: AgentRequest, signal?: AbortSignal): AsyncIterable<AgentEvent> {
    const settings = getAgentSettings()

    let model: ResolvedAgentModel
    try {
      const resolved = resolveModelConfig({ ...settings, model: request.model ?? settings.model })
      model = request.baseURL ? { ...resolved, baseURL: request.baseURL } : resolved
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) }
      return
    }

    const workspaceDir = request.workspaceDir ? resolve(request.workspaceDir) : process.cwd()
    yield* streamAgent({
      model,
      tools: createAgentTools(workspaceDir),
      messages: request.messages,
      workspaceDir,
      systemPrompt: settings.systemPrompt,
      maxSteps: settings.maxSteps,
      signal,
    })
  }
}
