import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  ToolLoopAgent,
  type LanguageModel,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Provider } from "./provider.ts";
import { compactIfNeeded, pickUsage, type CompactResult } from "./compaction.ts";
import { isContextOverflow } from "./overflow.ts";
import type { AgentRunOptions, ResolvedAgentModel } from "./types.ts";
import DEFAULT_SYSTEM_PROMPT from "./system-prompt.txt";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A resolved provider config object; anything else is already a LanguageModel. */
function isModelConfig(value: AgentRunOptions["model"]): value is ResolvedAgentModel {
  return typeof value === "object" && value !== null && "npm" in value && "model" in value;
}

/** Chunks a failed attempt may emit before any real content; buffered so a retry is invisible. */
function isPreContent(chunk: UIMessageChunk): boolean {
  return (
    chunk.type === "start" ||
    chunk.type === "start-step" ||
    chunk.type === "finish-step" ||
    chunk.type === "message-metadata"
  );
}

/**
 * Run one agent round-trip and return the AI SDK UI message stream response.
 *
 * The `ToolLoopAgent` owns the tool-calling loop (default stop: 20 steps). The
 * client owns the transcript, so this function stays stateless: it compacts the
 * incoming transcript (summarizing old turns into a checkpoint), runs the loop,
 * and reports the checkpoint + token usage back as assistant-message metadata.
 * Tool approvals come back as `tool-approval-response` parts on the next request.
 *
 * If the provider rejects the request for context overflow before any content
 * has streamed, the transcript is compacted once more and retried; a second
 * overflow is surfaced to the client.
 */
export async function streamAgent(options: AgentRunOptions): Promise<Response> {
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
  } = options;
  const languageModel: LanguageModel = isModelConfig(model) ? Provider.resolveModel(model) : model;
  const maxOutputTokens = isModelConfig(model) ? model.maxOutputTokens : undefined;
  const contextLimit = options.contextLimit ?? (isModelConfig(model) ? model.contextLimit : undefined);
  const instructions = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  const prepare = (force: boolean) =>
    compactIfNeeded({
      model: languageModel,
      messages,
      systemPrompt: instructions,
      tools,
      ...(contextLimit === undefined ? {} : { contextLimit }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(compaction === undefined ? {} : { policy: compaction }),
      force,
      ...(signal ? { signal } : {}),
    });

  const start = async (prepared: CompactResult) => {
    const agent = new ToolLoopAgent({
      model: languageModel,
      instructions,
      tools,
      ...(toolApproval === undefined ? {} : { toolApproval }),
      ...(maxSteps === undefined ? {} : { stopWhen: isStepCount(maxSteps) }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    });
    return createAgentUIStream({
      agent,
      uiMessages: prepared.messages,
      ...(signal ? { abortSignal: signal } : {}),
      onError: errorMessage,
      generateMessageId: () => `msg_${crypto.randomUUID()}`,
      messageMetadata: ({ part }) => {
        // Only the turn that produced the checkpoint carries it; later turns find
        // it in the transcript instead of re-stamping (and duplicating) it.
        if (part.type === "start") {
          return prepared.compacted && prepared.checkpoint ? { compaction: prepared.checkpoint } : undefined;
        }
        if (part.type === "finish") {
          return {
            usage: pickUsage(part.totalUsage),
            ...(contextLimit === undefined ? {} : { contextLimit }),
            ...(prepared.skipped === undefined ? {} : { compactionSkipped: prepared.skipped }),
          };
        }
        return undefined;
      },
    });
  };

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      let prepared = await prepare(forceCompact ?? false);
      let retried = false;

      for (;;) {
        // Hold pre-content chunks back so a retried attempt looks like the first.
        const buffered: UIMessageChunk[] = [];
        let started = false;
        let overflow: string | undefined;

        const flush = () => {
          while (buffered.length > 0) writer.write(buffered.shift()!);
        };

        try {
          const inner = await start(prepared);
          for await (const chunk of inner) {
            if (chunk.type === "error" && !started && !retried && isContextOverflow(chunk.errorText)) {
              overflow = chunk.errorText;
              break;
            }
            if (!started) {
              if (isPreContent(chunk)) {
                buffered.push(chunk);
                continue;
              }
              started = true;
              flush();
            }
            writer.write(chunk);
          }
        } catch (error) {
          const text = errorMessage(error);
          if (!started && !retried && isContextOverflow(text)) overflow = text;
          else throw error;
        }
        if (overflow === undefined) return;

        retried = true;
        prepared = await prepare(true);
        // Nothing left to summarize: surface the provider's limit to the client.
        if (!prepared.compacted) {
          writer.write({ type: "error", errorText: overflow });
          return;
        }
      }
    },
    onError: errorMessage,
  });

  return createUIMessageStreamResponse({ stream });
}
