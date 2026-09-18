import { resolve } from "node:path"
import type { ToolApprovalConfiguration, ToolSet, UIMessage } from "ai"
import { z } from "zod/v4"
import { Global } from "@nyx/global"
import { Provider, type ResolvedModel } from "../provider.ts"
import { Loop } from "../loop.ts"
import { Compaction, type ContextCheckpoint } from "../compaction.ts"
import { Attachment } from "../attachment.ts"
import { Bash } from "../tools/bash.ts"
import { Edit } from "../tools/edit.ts"
import { Glob } from "../tools/glob.ts"
import { Grep } from "../tools/grep.ts"
import { LocalImageToImage } from "../tools/local-image-to-image.ts"
import { LocalTextToSpeech } from "../tools/local-text-to-speech.ts"
import { Read } from "../tools/read.ts"
import { SearchKnowledge } from "../tools/search-knowledge.ts"
import { WebFetch } from "../tools/webfetch.ts"
import { WebSearch } from "../tools/websearch.ts"
import { Write } from "../tools/write.ts"
import { Knowledge } from "./knowledge.ts"
import DEFAULT_SYSTEM_PROMPT from "../system-prompt.txt"

export const AgentOptionsSchema = z.object({
  workspaceDir: z.string().optional(),
  sessionId: z.string().optional(),
  inlineAudio: z.boolean().optional(),
  forceCompact: z.boolean().optional(),
})
export type AgentOptions = z.infer<typeof AgentOptionsSchema>

export const AgentRequestSchema = AgentOptionsSchema.extend({
  messages: z.array(z.unknown()).min(1),
})
export type AgentRequestInput = z.infer<typeof AgentRequestSchema>

export interface AgentRequest extends AgentOptions {
  messages: UIMessage[]
}

export const CompactRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  workspaceDir: z.string().optional(),
  sessionId: z.string().optional(),
})
export type CompactRequestInput = z.infer<typeof CompactRequestSchema>

export interface CompactRequest {
  messages: UIMessage[]
  workspaceDir?: string
  sessionId?: string
}

export interface CompactResponse {
  checkpoint?: ContextCheckpoint
  compacted: boolean
  skipped?: "too-short"
  estimatedTokens?: number
  baselineTokens?: number
}


export class Agent {
  private static readonly NEEDS_APPROVAL = new Set([
    "write_file",
    "edit_file",
    "bash",
    "local_image_to_image",
    "local_text_to_speech",
  ])

  static readonly approval: ToolApprovalConfiguration<ToolSet, unknown> = ({ toolCall }) =>
    Agent.NEEDS_APPROVAL.has(toolCall.toolName) ? "user-approval" : "not-applicable"

  constructor(
    private readonly cache: Provider,
    private readonly knowledge: Knowledge,
  ) {}

  async run(request: AgentRequest, signal?: AbortSignal): Promise<Response> {
    const settings = (await Global.Settings.read()).agent ?? {}

    let model: ResolvedModel
    try {
      model = Provider.resolveModelConfig(settings)
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      )
    }

    const workspaceDir = resolve(request.workspaceDir ?? settings.workspaceDir ?? process.cwd())
    const tools = await this.tools(settings, workspaceDir, request.sessionId, request.inlineAudio)
    return Loop.stream({
      model,
      tools,
      toolApproval: Agent.approval,
      messages: Attachment.annotate(request.messages),
      systemPrompt: settings.systemPrompt,
      maxSteps: settings.maxSteps,
      compaction: settings.compaction,
      forceCompact: request.forceCompact,
      signal,
    })
  }

  async compact(request: CompactRequest): Promise<CompactResponse> {
    const settings = (await Global.Settings.read()).agent ?? {}
    const model = Provider.resolveModelConfig(settings)
    const workspaceDir = resolve(request.workspaceDir ?? settings.workspaceDir ?? process.cwd())
    const tools = await this.tools(settings, workspaceDir, request.sessionId)
    const systemPrompt = settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

    const messages = Attachment.annotate(request.messages)
    const result = await Compaction.compact({
      model: Provider.resolveModel(model),
      messages,
      systemPrompt,
      tools,
      ...(model.contextLimit === undefined ? {} : { contextLimit: model.contextLimit }),
      ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
      ...(settings.compaction === undefined ? {} : { policy: settings.compaction }),
      force: true,
    })
    const estimatedTokens = await Compaction.estimate({ systemPrompt, tools, messages: result.messages })
    const baselineTokens = await Compaction.estimate({
      systemPrompt,
      tools,
      messages: Compaction.apply(messages, Compaction.find(messages)?.checkpoint),
    })
    return {
      compacted: result.compacted,
      ...(result.compacted && result.checkpoint !== undefined ? { checkpoint: result.checkpoint } : {}),
      ...(result.skipped === undefined ? {} : { skipped: result.skipped }),
      estimatedTokens,
      baselineTokens,
    }
  }

  private async tools(
    settings: Global.AgentSettingsSchemaType,
    workspaceDir: string,
    sessionId?: string,
    inlineAudio?: boolean,
  ): Promise<ToolSet> {
    const modelTools = { cache: this.cache, workspaceDir, sessionId, inlineAudio }
    return {
      ...Read.create(workspaceDir),
      ...Write.create(workspaceDir),
      ...Edit.create(workspaceDir),
      ...Bash.create(workspaceDir),
      ...Grep.create(workspaceDir),
      ...Glob.create(workspaceDir),
      ...(settings.tools?.localModels === false
        ? {}
        : {
            ...(await LocalImageToImage.create(modelTools)),
            ...(await LocalTextToSpeech.create(modelTools)),
          }),
      ...(settings.tools?.knowledge === false ? {} : await SearchKnowledge.create(this.knowledge)),
      ...(settings.tools?.webSearch === false
        ? {}
        : { ...WebSearch.create({ sessionId }), ...WebFetch.create() }),
    }
  }
}
