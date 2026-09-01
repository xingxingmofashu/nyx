/**
 * Minimal LLM types.
 *
 * v1 is deliberately tiny: a single local provider streaming text.
 * No tools, no token accounting, no multi-provider abstraction.
 */

export type Role = "user" | "assistant" | "system";

export interface LLMMessage {
  role: Role;
  content: string;
}

/** Events emitted during a chat generation. */
export type LLMEvent =
  | { type: "text-delta"; delta: string }
  | { type: "error"; message: string };

export interface StreamOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  /** Stream a completion for a conversation. */
  stream(messages: LLMMessage[], options?: StreamOptions): AsyncIterable<LLMEvent>;
}
