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
  /**
   * Context window in tokens, from the provider's config `limit.context`, else
   * the models.dev catalog. Undefined when unknown: the agent then only compacts
   * after the provider actually rejects a request for context overflow.
   */
  contextLimit?: number;
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
  /**
   * Context window in tokens, overriding a resolved config. Undefined (and no
   * resolved value) means "unknown": no pre-emptive compaction.
   */
  contextLimit?: number;
  /** Context-compaction policy; omit to use the defaults. */
  compaction?: CompactionPolicy;
  /** Force compaction even when the transcript fits (a manual request). */
  forceCompact?: boolean;
  signal?: AbortSignal;
}

export type { UIMessage, UIMessageChunk };

/** Provider-reported token usage for one assistant message (from the AI SDK finish part). */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * A context-compaction checkpoint. Produced when old turns are summarized; it is
 * attached to the assistant message that triggered it (as message metadata), so
 * it persists with the transcript and comes back on the next request. The
 * compaction then replaces everything up to and including `coveredThroughId`
 * with a single checkpoint message.
 */
export interface ContextCheckpoint {
  /** Anchored Markdown summary of the covered turns. */
  summary: string;
  /** Id of the last transcript message the summary covers. */
  coveredThroughId: string;
  /** How many leading messages are covered (drives the UI marker). */
  coveredCount: number;
  createdAt: string;
  reason: "auto" | "manual";
}

/** Context-compaction policy, mirroring `AgentCompactionSettings` from settings. */
export interface CompactionPolicy {
  /** Summarize automatically when the window fills (default true). */
  auto?: boolean;
  /** Clear old tool output bodies before summarizing (default true). */
  prune?: boolean;
  /** Tokens kept verbatim at the tail (default: a quarter of the usable window, 2k–15k). */
  keep?: { tokens?: number };
  /** Free-token headroom above the output reserve that triggers compaction (default 20000). */
  buffer?: number;
}
