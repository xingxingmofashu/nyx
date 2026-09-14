import type { RawAudio, RawImage } from "@huggingface/transformers";

export type Role = "user" | "assistant" | "system";

/** A plain-text transcript turn fed to a text model. */
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

/** The local ONNX tasks nyx supports. */
export const LLM_TASKS = ["text-generation", "image-to-image", "text-to-audio"] as const;
export type LLMTask = (typeof LLM_TASKS)[number];

/** Capability marker; consumers depend on `TextProvider` or `ImageProvider`. */
export interface LLMProvider {
  readonly id: string;
  /** The local task this provider implements. */
  readonly task: LLMTask;
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

/** Options for one text-to-audio synthesis. */
export interface TextToAudioOptions {
  /** Speaker/voice embeddings: raw values, or a path/URL to a `.bin` file (models that require them). */
  speaker?: string | Float32Array;
  /** Playback speed (models that support it). */
  speed?: number;
  /** Denoising steps (models that support it). */
  numInferenceSteps?: number;
}

/** A provider that synthesizes audio from text. */
export interface AudioProvider extends LLMProvider {
  readonly task: "text-to-audio";
  generate(text: string, options?: TextToAudioOptions): Promise<RawAudio>;
}
