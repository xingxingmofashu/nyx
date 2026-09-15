import type { RawAudio, RawImage } from "@huggingface/transformers";

/** The local ONNX tasks nyx supports. */
export const LLM_TASKS = [
  "image-to-image",
  "text-to-speech",
  "automatic-speech-recognition",
  "feature-extraction",
] as const;
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

/** Options for one automatic-speech-recognition transcription (Whisper-style). */
export interface AutomaticSpeechRecognitionOptions {
  /** Source language hint; omit to auto-detect. */
  language?: string;
  /** `"transcribe"` (default) or `"translate"` (into English). */
  task?: "transcribe" | "translate";
}

/** A provider that transcribes mono 16 kHz audio into text. */
export interface TranscriptionProvider extends LLMProvider {
  readonly task: "automatic-speech-recognition";
  transcribe(samples: Float32Array, options?: AutomaticSpeechRecognitionOptions): Promise<string>;
}

/** Options for one embedding call. */
export interface EmbeddingOptions {
  /**
   * Whether the text is a search query or stored content. E5-family models
   * require asymmetric `query:`/`passage:` prefixes; other models ignore it.
   * Defaults to `"passage"`.
   */
  type?: "query" | "passage";
  /** Checked before each batch; ONNX inference itself is not interruptible. */
  signal?: AbortSignal;
}

/** A provider that turns text into normalized embedding vectors. */
export interface EmbeddingProvider extends LLMProvider {
  readonly task: "feature-extraction";
  /** Embed `texts` in order; each vector is L2-normalized (cosine == dot). */
  embed(texts: string[], options?: EmbeddingOptions): Promise<Float32Array[]>;
}
