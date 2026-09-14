import type { RawAudio, RawImage } from "@huggingface/transformers";

/** The local ONNX tasks nyx supports. */
export const LLM_TASKS = ["image-to-image", "text-to-speech"] as const;
export type LLMTask = (typeof LLM_TASKS)[number];

/** Capability marker; consumers depend on `ImageProvider` or `SpeechProvider`. */
export interface LLMProvider {
  readonly id: string;
  /** The local task this provider implements. */
  readonly task: LLMTask;
  readonly model: string;
}

/** A provider that transforms a single input image. */
export interface ImageProvider extends LLMProvider {
  readonly task: "image-to-image";
  generate(input: ImageSource): Promise<RawImage>;
}

/** Anything a generate-style provider accepts as an image. */
export type ImageSource = string | RawImage;

/** Options for one text-to-speech synthesis. */
export interface TextToSpeechOptions {
  /** Speaker/voice embeddings: raw values, or a path/URL to a `.bin` file (models that require them). */
  speaker?: string | Float32Array;
  /** Playback speed (models that support it). */
  speed?: number;
  /** Denoising steps (models that support it). */
  numInferenceSteps?: number;
}

/** A provider that synthesizes speech from text. */
export interface SpeechProvider extends LLMProvider {
  readonly task: "text-to-speech";
  generate(text: string, options?: TextToSpeechOptions): Promise<RawAudio>;
}
