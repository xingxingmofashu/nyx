import {
  createAgentUIStreamResponse,
  isStepCount,
  ToolLoopAgent,
  type LanguageModel,
} from "ai";
import { resolveModel } from "./provider.ts";
import type { AgentRunOptions, ResolvedAgentModel } from "./types.ts";

const DEFAULT_SYSTEM_PROMPT = [
  "You are nyx, a coding agent operating inside a single workspace directory.",
  "Use the provided tools to inspect and modify files; paths are relative to the workspace root.",
  "Read before you edit, keep changes minimal, and never attempt to access paths outside the workspace.",
  "When a tool call is denied by the user, do not retry it.",
].join(" ");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A resolved provider config object; anything else is already a LanguageModel. */
function isModelConfig(value: AgentRunOptions["model"]): value is ResolvedAgentModel {
  return typeof value === "object" && value !== null && "npm" in value && "model" in value;
}

/**
 * Run one agent round-trip and return the AI SDK UI message stream response.
 * The `ToolLoopAgent` owns the tool-calling loop (default stop: 20 steps) and
 * `createAgentUIStreamResponse` converts the `UIMessage[]` transcript to model
 * messages, runs the loop, and emits the UI message stream. The client owns the
 * transcript: tool approvals come back as `tool-approval-response` parts on the
 * next request, and the server stays stateless.
 */
export async function streamAgent(options: AgentRunOptions): Promise<Response> {
  const { model, tools, toolApproval, messages, systemPrompt, maxSteps, signal } = options;
  const languageModel: LanguageModel = isModelConfig(model) ? resolveModel(model) : model;
  const maxOutputTokens = isModelConfig(model) ? model.maxOutputTokens : undefined;

  const agent = new ToolLoopAgent({
    model: languageModel,
    instructions: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    tools,
    ...(toolApproval === undefined ? {} : { toolApproval }),
    ...(maxSteps === undefined ? {} : { stopWhen: isStepCount(maxSteps) }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: signal,
    generateMessageId: () => `msg_${crypto.randomUUID()}`,
    onError: errorMessage,
  });
}
