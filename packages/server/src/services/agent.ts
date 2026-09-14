import { resolve } from "node:path"
import { streamAgent, type AgentEvent, type AgentModelConfig } from "@nyx/agent"
import { getAgentSettings } from "@nyx/config"
import { createAgentTools } from "../lib/agent-tools"
import type { AgentRequest } from "../shared/types"

/**
 * Runs the remote "master brain" agent loop. The brain is a cloud model; the
 * tools are local coding tools confined to `workspaceDir`. Stateless: each run
 * carries the full transcript, so an approval is answered by re-sending it.
 */
export class AgentService {
  /** Stream one agent run over `request.messages`. */
  async *stream(request: AgentRequest, signal?: AbortSignal): AsyncIterable<AgentEvent> {
    const settings = getAgentSettings()
    const model: AgentModelConfig = {
      provider: request.provider ?? settings.provider ?? "",
      model: request.model ?? settings.model ?? "",
      baseUrl: request.baseUrl ?? settings.baseUrl,
      apiKey: settings.apiKey,
      headers: settings.headers,
    }

    const missing: string[] = []
    if (!model.provider) missing.push("provider")
    if (!model.model) missing.push("model")
    if (!model.apiKey) missing.push("apiKey")
    if (missing.length > 0) {
      yield {
        type: "error",
        message: `Missing agent ${missing.join(", ")}. Configure ~/.nyx/settings.json (agent.*) or NYX_AGENT_* env vars.`,
      }
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
