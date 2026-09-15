import type { LanguageModel, UIMessage, UIMessageChunk } from "ai";
import type { ZodType } from "zod/v4";

/**
 * Wire + domain types for @nyx/core. The agent loop is provider-agnostic:
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
 * A tool the brain may call. `execute` returns a JSON-serializable output, which
 * the AI SDK feeds back to the model as the tool result (mapped through
 * `toModelOutput` when provided).
 */
export interface AgentTool<Input = unknown, Output = string> {
  name: string;
  description: string;
  inputSchema: ZodType<Input>;
  approval: AgentToolApproval;
  execute: (input: Input, ctx: AgentToolContext) => Promise<Output> | Output;
  /**
   * Optional mapping from the `execute` output to the text the model sees. Use
   * it when `execute` returns a rich payload (e.g. inline audio for client-side
   * playback) that should not be fed to the model verbatim.
   */
  toModelOutput?: (output: Output) => string;
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
  /** UI-message transcript (the AI SDK's canonical chat shape). */
  messages: UIMessage[];
  workspaceDir: string;
  systemPrompt?: string;
  /** Max model round-trips before stopping (default 20). */
  maxSteps?: number;
  signal?: AbortSignal;
}

export type { UIMessage, UIMessageChunk };

