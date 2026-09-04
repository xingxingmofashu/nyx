import type { DataType, RawImage } from "@huggingface/transformers";

export type Role = "user" | "assistant" | "system";

/**
 * A message fed to a local text model.
 *
 * Today this is always a plain string (the transformers.js chat template is
 * applied inside the pipeline). Multi-turn sessions and tool results will
 * extend this to structured content blocks — that extension happens here,
 * keeping provider signatures unchanged.
 */
export interface LLMMessage {
  role: Role;
  content: string;
}

/** A single token emitted while streaming. */
export interface LLMTextDelta {
  type: "text-delta";
  delta: string;
}

export type LLMEvent = LLMTextDelta | { type: "error"; message: string };

export interface StreamOptions {
  /** Max tokens to generate. Defaults to the provider's own default. */
  maxTokens?: number;
  /** Sampling temperature. */
  temperature?: number;
}

/** The local ONNX tasks nyx supports. Single source of truth (B1). */
export const LLM_TASKS = ["text-generation", "image-to-image"] as const;
export type LlmTask = (typeof LLM_TASKS)[number];

/** Default quantization dtype per task — a task maps to one dtype. */
export const TASK_DTYPES: Record<LlmTask, DataType> = {
  "text-generation": "q4",
  "image-to-image": "fp32",
};

/**
 * Capability provider marker. Real callers depend on the capability they
 * need — `TextProvider` or `ImageProvider` — never on this base alone.
 */
export interface LLMProvider {
  readonly id: string;
  /** The local task this provider implements. */
  readonly task: LlmTask;
  readonly model: string;
}

/** A provider that streams token deltas for a chat-style prompt. */
export interface TextProvider extends LLMProvider {
  readonly task: "text-generation";
  stream(messages: LLMMessage[], options?: StreamOptions): AsyncIterable<LLMEvent>;
}

/** A provider that transforms a single input image. */
export interface ImageProvider extends LLMProvider {
  readonly task: "image-to-image";
  generate(input: ImageSource): Promise<RawImage>;
}

/** Anything a generate-style provider accepts as an image. */
export type ImageSource = string | RawImage;
