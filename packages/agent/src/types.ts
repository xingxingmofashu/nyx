import type {
  LanguageModel,
  ToolApprovalConfiguration,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from "ai";

/**
 * Wire + domain types for @nyx/agent. The agent loop is provider-agnostic:
 * the caller injects a model config, a set of tools, and the full transcript.
 */

/** Resolved remote-brain model: built from settings by Provider.resolveModelConfig. */
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

/** Everything needed for one agent run; the transcript is caller-owned. */
export interface AgentRunOptions {
  /** A resolved model (built from settings) or a pre-built model. */
  model: ResolvedAgentModel | LanguageModel;
  tools: ToolSet;
  /**
   * Which tools pause for user approval, by tool name. The AI SDK configures
   * approval on the loop rather than per tool, so the caller owns this policy.
   */
  toolApproval?: ToolApprovalConfiguration<ToolSet, unknown>;
  /** UI-message transcript (the AI SDK's canonical chat shape). */
  messages: UIMessage[];
  systemPrompt?: string;
  /** Max model round-trips before stopping (default 20). */
  maxSteps?: number;
  signal?: AbortSignal;
}

export type { UIMessage, UIMessageChunk };
