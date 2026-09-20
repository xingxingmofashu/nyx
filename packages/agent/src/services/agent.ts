import { resolve } from "node:path"
import type { ToolApprovalStatus, ToolSet, UIMessage } from "ai"
import { z } from "zod/v4"
import { Global } from "@nyx/global"
import { Provider, type ResolvedModel } from "../provider.ts"
import { Loop } from "../loop.ts"
import { Permission, type PermissionRuleset } from "../permission.ts"
import { Compaction, ContextCheckpointSchema } from "../compaction.ts"
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
  workspaceDir: z.string().min(1),
  sessionId: z.string().optional(),
  inlineAudio: z.boolean().optional(),
  forceCompact: z.boolean().optional(),
  always: z.array(z.string()).optional(),
  revoke: z.boolean().optional(),
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
  workspaceDir: z.string().min(1),
  sessionId: z.string().optional(),
})
export type CompactRequestInput = z.infer<typeof CompactRequestSchema>

export interface CompactRequest {
  messages: UIMessage[]
  workspaceDir: string
  sessionId?: string
}

export const CompactResponseSchema = z.object({
  checkpoint: ContextCheckpointSchema.optional(),
  compacted: z.boolean(),
  skipped: z.literal("too-short").optional(),
  error: z.string().optional(),
  estimatedTokens: z.number().optional(),
  baselineTokens: z.number().optional(),
})
export type CompactResponse = z.infer<typeof CompactResponseSchema>

export class Agent {
  private static readonly DEFAULT_PERMISSION: Global.AgentPermissionSchemaType = {
    "*": "allow",
    write_file: "ask",
    edit_file: "ask",
    bash: "ask",
    external_directory: "ask",
    local_image_to_image: "ask",
    local_text_to_speech: "ask",
  }

  private readonly approvalSecret = crypto.getRandomValues(new Uint8Array(32))

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

    const workspaceDir = resolve(request.workspaceDir)
    const ruleset = Agent.ruleset(settings, request, workspaceDir)
    const tools = Permission.visible(
      await this.tools(settings, workspaceDir, request.sessionId, request.inlineAudio),
      ruleset,
    )
    return Loop.stream({
      model,
      tools,
      toolApproval: ({ toolCall }) => Agent.approval(toolCall.toolName, toolCall.input, workspaceDir, ruleset),
      toolApprovalSecret: this.approvalSecret,
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
    const workspaceDir = resolve(request.workspaceDir)
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
      ...(result.error === undefined ? {} : { error: result.error }),
      estimatedTokens,
      baselineTokens,
    }
  }

  private static ruleset(
    settings: Global.AgentSettingsSchemaType,
    request: AgentRequest,
    workspaceDir: string,
  ): PermissionRuleset {
    const sessionId = request.sessionId
    if (sessionId && request.revoke) Permission.revoke(sessionId)
    if (sessionId && request.always) {
      for (const toolCallId of request.always) {
        const call = Agent.toolCall(request.messages, toolCallId)
        if (!call) continue
        for (const target of Permission.targets(call.toolName, call.input, workspaceDir)) {
          Permission.allow(
            sessionId,
            target.always.map((pattern) => ({ permission: target.permission, pattern, action: "allow" as const })),
          )
        }
      }
    }
    return Permission.merge(
      Permission.fromConfig(Agent.DEFAULT_PERMISSION),
      Permission.fromConfig(settings.permission),
      sessionId ? Permission.grants(sessionId) : [],
    )
  }

  private static approval(
    toolName: string,
    input: unknown,
    workspaceDir: string,
    ruleset: PermissionRuleset,
  ): ToolApprovalStatus {
    const targets = Permission.targets(toolName, input, workspaceDir)
    const decision = Permission.decide(targets, ruleset)
    if (decision.action === "deny") return { type: "denied", reason: `Denied by the ${decision.permission} permission rules` }
    if (decision.action === "ask") {
      const always = targets.find((target) => target.permission === decision.permission)?.always ?? []
      return {
        type: "user-approval",
        reason: always.length === 0 ? `Approval required for ${decision.permission}` : `Always allows ${always.join(", ")}`,
      }
    }
    return "not-applicable"
  }

  private static toolCall(messages: UIMessage[], toolCallId: string): { toolName: string; input: unknown } | undefined {
    for (const message of messages) {
      for (const part of message.parts) {
        const value = part as { type?: string; toolCallId?: string; toolName?: string; input?: unknown }
        if (value.toolCallId !== toolCallId) continue
        if (value.type === "dynamic-tool") return { toolName: value.toolName ?? "", input: value.input }
        if (value.type?.startsWith("tool-")) return { toolName: value.type.slice(5), input: value.input }
      }
    }
    return undefined
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
