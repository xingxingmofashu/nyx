import type { LanguageModel, ModelMessage } from "ai";
import type { ZodType } from "zod/v4";

/**
 * Wire + domain types for @nyx/agent. The agent loop is provider-agnostic:
 * the caller injects a model config, a set of tools, and the full transcript.
 */

/** Resolved remote-brain model: built from settings by resolveModelConfig. */
export interface ResolvedAgentModel {
  /** AI SDK provider package, e.g. "@ai-sdk/openai-compatible" or "@ai-sdk/anthropic". */
  npm: string;
  model: string;
  apiKey?: string;
  /** Provider base URL (required by the openai-compatible provider). */
  baseURL?: string;
  /** Extra request headers (e.g. a routing/session header some gateways require). */
  headers?: Record<string, string>;
  /** Cap on generated tokens, from the provider's `limit.output`. */
  maxOutputTokens?: number;
}

/** Whether a tool runs automatically or pauses for user approval. */
export type AgentToolApproval = "never" | "always";

/** Runtime context handed to every tool execution. */
export interface AgentToolContext {
  /** All file/bash tools are confined to this directory. */
  workspaceDir: string;
  signal?: AbortSignal;
}

/**
 * A tool the brain may call. `execute` returns plain text, which the AI SDK
 * feeds back to the model as the tool result.
 */
export interface AgentTool<Input = unknown, Output = string> {
  name: string;
  description: string;
  inputSchema: ZodType<Input>;
  approval: AgentToolApproval;
  execute: (input: Input, ctx: AgentToolContext) => Promise<Output> | Output;
}

/**
 * A heterogeneous collection of tools. Mirrors the AI SDK's `ToolSet`, which
 * also erases per-tool input types at the collection boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentToolSet = Array<AgentTool<any, any>>;

/** Everything needed for one agent run; the transcript is caller-owned. */
export interface AgentRunOptions {
  /** A resolved model (built from settings) or a pre-built model. */
  model: ResolvedAgentModel | LanguageModel;
  tools: AgentToolSet;
  messages: ModelMessage[];
  workspaceDir: string;
  systemPrompt?: string;
  /** Max model round-trips before stopping (default 20). */
  maxSteps?: number;
  signal?: AbortSignal;
}

/**
 * Streamed agent events. Approval is a two-call flow: a call surfaces
 * `approval-request` and ends; the caller re-sends the transcript with a
 * `tool-approval-response` for the next call.
 */
export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool-error"; toolCallId: string; toolName: string; message: string }
  | { type: "tool-denied"; toolCallId: string; toolName: string }
  | {
      type: "approval-request";
      approvalId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      reason?: string;
    }
  /** Terminal event: assistant/tool messages to append to the transcript. */
  | { type: "finish"; text: string; messages: ModelMessage[] }
  | { type: "error"; message: string };

export type { ModelMessage };
