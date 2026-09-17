import { resolve } from "node:path"
import type { ToolSet } from "ai"
import { Provider } from "../provider.ts"
import { streamAgent } from "../agent.ts"
import { compactIfNeeded, applyCheckpoint, estimateContext, findCheckpoint } from "../compaction.ts"
import type { ResolvedAgentModel } from "../types.ts"
import { getAgentSettings, type AgentSettings } from "@nyx/config"
import { withAttachmentNotes } from "../attachment"
import { createAgentTools, createKnowledgeTools, createModelTools, createWebTools, toolApproval } from "../tools/index.ts"
import { KnowledgeService } from "./knowledge"
import { ensureModelsCatalog } from "../models-dev.ts"
import type { AgentRequest, CompactRequest, CompactResponse } from "../schema"
import DEFAULT_SYSTEM_PROMPT from "../system-prompt.txt"

/**
 * Runs the agent loop against a remote model. The agent model is a cloud model
 * (resolved from settings), the tools are local coding tools confined to
 * `workspaceDir`. Stateless: each run carries the full transcript, so an
 * approval is answered by re-sending it.
 */
export class AgentService {
  constructor(
    private readonly cache: Provider,
    private readonly knowledge: KnowledgeService,
  ) {}

  /** Run one agent turn over `request.messages`, returning the UI message stream. */
  async run(request: AgentRequest, signal?: AbortSignal): Promise<Response> {
    // Model limits (the context window) come from the models.dev catalog when a
    // provider does not declare them. Awaiting only waits for the on-disk cache,
    // so the window is known from the first turn.
    await ensureModelsCatalog()
    const settings = getAgentSettings()

    let model: ResolvedAgentModel
    try {
      model = Provider.resolveModelConfig(settings)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
    }

    const workspaceDir = resolve(request.workspaceDir ?? settings.workspaceDir ?? process.cwd())
    const tools = this.tools(settings, workspaceDir, request.sessionId, request.inlineAudio)
    return streamAgent({
      model,
      tools,
      toolApproval,
      messages: withAttachmentNotes(request.messages),
      systemPrompt: settings.systemPrompt,
      maxSteps: settings.maxSteps,
      compaction: settings.compaction,
      forceCompact: request.forceCompact,
      signal,
    })
  }

  /**
   * Summarize the transcript into a checkpoint now, without running a turn — the
   * desktop's "Compact" action. Returns the checkpoint for the client to persist
   * (as message metadata, exactly where a live turn would have put it) plus the
   * estimated size of the model-facing transcript afterwards.
   */
  async compact(request: CompactRequest): Promise<CompactResponse> {
    await ensureModelsCatalog()
    const settings = getAgentSettings()
    const model = Provider.resolveModelConfig(settings)
    const workspaceDir = resolve(request.workspaceDir ?? settings.workspaceDir ?? process.cwd())
    const tools = this.tools(settings, workspaceDir, request.sessionId)
    const systemPrompt = settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

    const messages = withAttachmentNotes(request.messages)
    const result = await compactIfNeeded({
      model: Provider.resolveModel(model),
      messages,
      systemPrompt,
      tools,
      ...(model.contextLimit === undefined ? {} : { contextLimit: model.contextLimit }),
      ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
      ...(settings.compaction === undefined ? {} : { policy: settings.compaction }),
      force: true,
    })
    // Both estimates exist only so the client can rescale the post-compaction
    // size onto the provider's own token scale.
    const estimatedTokens = await estimateContext({ systemPrompt, tools, messages: result.messages })
    const baselineTokens = await estimateContext({
      systemPrompt,
      tools,
      messages: applyCheckpoint(messages, findCheckpoint(messages)?.checkpoint),
    })
    return {
      compacted: result.compacted,
      // Only a summary produced *now* is worth persisting; the result otherwise
      // carries whatever checkpoint the transcript already had.
      ...(result.compacted && result.checkpoint !== undefined ? { checkpoint: result.checkpoint } : {}),
      ...(result.skipped === undefined ? {} : { skipped: result.skipped }),
      estimatedTokens,
      baselineTokens,
    }
  }

  /** The tool set one turn (or one compaction estimate) is scoped to. */
  private tools(
    settings: AgentSettings,
    workspaceDir: string,
    sessionId?: string,
    inlineAudio?: boolean,
  ): ToolSet {
    return {
      ...createAgentTools(workspaceDir),
      ...(settings.tools?.localModels === false
        ? {}
        : createModelTools({
            cache: this.cache,
            workspaceDir,
            sessionId,
            inlineAudio,
          })),
      ...(settings.tools?.knowledge === false ? {} : createKnowledgeTools(this.knowledge)),
      ...(settings.tools?.webSearch === false ? {} : createWebTools({ sessionId })),
    }
  }
}
