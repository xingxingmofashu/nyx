export type Role = "user" | "assistant" | "system";

export interface LLMMessage {
  role: Role;
  content: string;
}

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
  stream(messages: LLMMessage[], options?: StreamOptions): AsyncIterable<LLMEvent>;
}
