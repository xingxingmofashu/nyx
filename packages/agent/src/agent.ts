import { isStepCount, streamText, tool as aiTool, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { resolveModel } from "./providers.ts";
import type { AgentEvent, AgentModelConfig, AgentRunOptions, AgentToolSet } from "./types.ts";

const DEFAULT_SYSTEM_PROMPT = [
  "You are nyx, a coding agent operating inside a single workspace directory.",
  "Use the provided tools to inspect and modify files; paths are relative to the workspace root.",
  "Read before you edit, keep changes minimal, and never attempt to access paths outside the workspace.",
  "When a tool call is denied by the user, do not retry it.",
].join(" ");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A provider config object; anything else is already a LanguageModel. */
function isModelConfig(value: AgentRunOptions["model"]): value is AgentModelConfig {
  return typeof value === "object" && value !== null && "provider" in value && "model" in value;
}

/** Adapt our declarative AgentTool[] into AI SDK tools + approval policy. */
function toAiTools(tools: AgentToolSet, workspaceDir: string, signal?: AbortSignal): {
  tools: ToolSet;
  toolApproval: Record<string, "user-approval" | "not-applicable">;
} {
  const aiTools: ToolSet = {};
  const toolApproval: Record<string, "user-approval" | "not-applicable"> = {};
  for (const t of tools) {
    aiTools[t.name] = aiTool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: (input, { abortSignal }) => t.execute(input, { workspaceDir, signal: abortSignal ?? signal }),
    });
    toolApproval[t.name] = t.approval === "always" ? "user-approval" : "not-applicable";
  }
  return { tools: aiTools, toolApproval };
}

/**
 * Run one agent round-trip, streaming AgentEvents. A returned `finish` carries
 * only the messages produced this call — append them to the transcript before
 * continuing (e.g. after answering an `approval-request`).
 */
export async function* streamAgent(options: AgentRunOptions): AsyncIterable<AgentEvent> {
  const { model, tools, messages, workspaceDir, systemPrompt, maxSteps = 20, signal } = options;
  const { tools: aiTools, toolApproval } = toAiTools(tools, workspaceDir, signal);
  const languageModel: LanguageModel = isModelConfig(model) ? resolveModel(model) : model;

  const result = streamText({
    model: languageModel,
    system: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    messages,
    tools: aiTools,
    toolApproval,
    stopWhen: isStepCount(maxSteps),
    abortSignal: signal,
  });

  let text = "";
  try {
    for await (const part of result.stream) {
      switch (part.type) {
        case "text-delta":
          text += part.text;
          yield { type: "text-delta", text: part.text };
          break;
        case "tool-call":
          yield { type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, input: part.input };
          break;
        case "tool-result":
          yield { type: "tool-result", toolCallId: part.toolCallId, toolName: part.toolName, output: part.output };
          break;
        case "tool-error":
          yield {
            type: "tool-error",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            message: errorMessage(part.error),
          };
          break;
        case "tool-output-denied":
          yield { type: "tool-denied", toolCallId: part.toolCallId, toolName: part.toolName };
          break;
        case "tool-approval-request":
          yield {
            type: "approval-request",
            approvalId: part.approvalId,
            toolCallId: part.toolCall.toolCallId,
            toolName: part.toolCall.toolName,
            input: part.toolCall.input,
            reason: part.reason,
          };
          break;
        case "error":
          yield { type: "error", message: errorMessage(part.error) };
          break;
        default:
          break;
      }
    }
  } catch (error) {
    yield { type: "error", message: errorMessage(error) };
    return;
  }

  let responseMessages: ModelMessage[] = [];
  try {
    responseMessages = await result.responseMessages;
  } catch {
    responseMessages = [];
  }
  yield { type: "finish", text, messages: responseMessages };
}
