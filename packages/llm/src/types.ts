import type { PipelineType, RawImage } from "@huggingface/transformers";

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

/** Shared surface of every local ONNX pipeline provider. */
export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  /** transformers.js pipeline task this provider runs. */
  readonly task: PipelineType;
}

/** Anything a generate-style provider accepts as an image. */
export type ImageSource = string | RawImage;
