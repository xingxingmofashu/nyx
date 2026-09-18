import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  ToolLoopAgent,
  type LanguageModel,
  type ToolApprovalConfiguration,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import { Provider, type ResolvedModel } from "./provider.ts"
import { Compaction, type CompactionPolicy, type CompactionResult } from "./compaction.ts"
import DEFAULT_SYSTEM_PROMPT from "./system-prompt.txt"

export interface RunOptions {
  model: ResolvedModel | LanguageModel
  tools: ToolSet
  toolApproval?: ToolApprovalConfiguration<ToolSet, unknown>
  messages: UIMessage[]
  systemPrompt?: string
  maxSteps?: number
  contextLimit?: number
  compaction?: CompactionPolicy
  forceCompact?: boolean
  signal?: AbortSignal
}

export class Loop {
  private static readonly OVERFLOW_PATTERNS = [
    /prompt is too long/i,
    /request_too_large/i,
    /input is too long for requested model/i,
    /exceeds the context window/i,
    /exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i,
    /input token count.*exceeds the maximum/i,
    /tokens in request more than max tokens allowed/i,
    /maximum prompt length is \d+/i,
    /reduce the length of the messages/i,
    /maximum context length is \d+ tokens/i,
    /exceeds (?:the )?maximum allowed input length of [\d,]+ tokens?/i,
    /input \(\d+ tokens\) is longer than the model'?s context length \(\d+ tokens\)/i,
    /exceeds the limit of \d+/i,
    /exceeds the available context size/i,
    /greater than the context length/i,
    /context window exceeds limit/i,
    /exceeded model token limit/i,
    /context[_ ]length[_ ]exceeded/i,
    /context length is only \d+ tokens/i,
    /input length.*exceeds.*context length/i,
    /prompt too long; exceeded (?:max )?context length/i,
    /too large for model with \d+ maximum context length/i,
    /prompt has [\d,]+ tokens?, but the configured context size is [\d,]+ tokens?/i,
    /model_context_window_exceeded/i,
    /token limit exceeded/i,
  ]

  private static readonly OVERFLOW_EXCLUSIONS = [
    /rate limit/i,
    /too many requests/i,
    /throttling error/i,
    /service unavailable/i,
  ]

  static async stream(options: RunOptions): Promise<Response> {
    const {
      model,
      tools,
      toolApproval,
      messages,
      systemPrompt,
      maxSteps,
      signal,
      compaction,
      forceCompact,
    } = options
    const languageModel: LanguageModel = Loop.isModelConfig(model) ? Provider.resolveModel(model) : model
    const maxOutputTokens = Loop.isModelConfig(model) ? model.maxOutputTokens : undefined
    const contextLimit =
      options.contextLimit ?? (Loop.isModelConfig(model) ? model.contextLimit : undefined)
    const instructions = systemPrompt ?? DEFAULT_SYSTEM_PROMPT

    const prepare = (force: boolean) =>
      Compaction.compact({
        model: languageModel,
        messages,
        systemPrompt: instructions,
        tools,
        ...(contextLimit === undefined ? {} : { contextLimit }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        ...(compaction === undefined ? {} : { policy: compaction }),
        force,
        ...(signal ? { signal } : {}),
      })

    const start = async (prepared: CompactionResult) => {
      const agent = new ToolLoopAgent({
        model: languageModel,
        instructions,
        tools,
        ...(toolApproval === undefined ? {} : { toolApproval }),
        ...(maxSteps === undefined ? {} : { stopWhen: isStepCount(maxSteps) }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      })
      return createAgentUIStream({
        agent,
        uiMessages: prepared.messages,
        ...(signal ? { abortSignal: signal } : {}),
        onError: Loop.errorMessage,
        generateMessageId: () => `msg_${crypto.randomUUID()}`,
        messageMetadata: ({ part }) => {
          if (part.type === "start") {
            return prepared.compacted && prepared.checkpoint ? { compaction: prepared.checkpoint } : undefined
          }
          if (part.type === "finish") {
            return {
              usage: Compaction.pickUsage(part.totalUsage),
              ...(contextLimit === undefined ? {} : { contextLimit }),
              ...(prepared.skipped === undefined ? {} : { compactionSkipped: prepared.skipped }),
            }
          }
          return undefined
        },
      })
    }

    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        let prepared = await prepare(forceCompact ?? false)
        let retried = false

        for (;;) {
          const buffered: UIMessageChunk[] = []
          let started = false
          let overflow: string | undefined

          const flush = () => {
            while (buffered.length > 0) writer.write(buffered.shift()!)
          }

          try {
            const inner = await start(prepared)
            for await (const chunk of inner) {
              if (chunk.type === "error" && !started && !retried && Loop.matches(chunk.errorText)) {
                overflow = chunk.errorText
                break
              }
              if (!started) {
                if (Loop.isPreContent(chunk)) {
                  buffered.push(chunk)
                  continue
                }
                started = true
                flush()
              }
              writer.write(chunk)
            }
          } catch (error) {
            const text = Loop.errorMessage(error)
            if (!started && !retried && Loop.matches(text)) overflow = text
            else throw error
          }
          if (overflow === undefined) return

          retried = true
          prepared = await prepare(true)
          if (!prepared.compacted) {
            writer.write({ type: "error", errorText: overflow })
            return
          }
        }
      },
      onError: Loop.errorMessage,
    })

    return createUIMessageStreamResponse({ stream })
  }

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private static matches(message: string): boolean {
    if (Loop.OVERFLOW_EXCLUSIONS.some((pattern) => pattern.test(message))) return false
    return Loop.OVERFLOW_PATTERNS.some((pattern) => pattern.test(message))
  }

  private static isModelConfig(value: RunOptions["model"]): value is ResolvedModel {
    return typeof value === "object" && value !== null && "npm" in value && "model" in value
  }

  private static isPreContent(chunk: UIMessageChunk): boolean {
    return (
      chunk.type === "start" ||
      chunk.type === "start-step" ||
      chunk.type === "finish-step" ||
      chunk.type === "message-metadata"
    )
  }
}
