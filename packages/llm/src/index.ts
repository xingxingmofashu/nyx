// Public surface of @nyx/llm; everything else in the package is internal.

export type {
  LLMProvider,
  ImageProvider,
  ImageSource,
  TextToSpeechOptions,
  SpeechProvider,
  AutomaticSpeechRecognitionOptions,
  TranscriptionProvider,
  EmbeddingOptions,
  EmbeddingProvider,
} from "./types.ts";
export { LLM_TASKS } from "./types.ts";
export type { LLMTask } from "./types.ts";

export { configureEnv, loadPipeline, clearModelCache } from "./runtime.ts";
export type { ModelRuntimeOptions, ProgressInfo } from "./runtime.ts";

export { list, pull, find } from "./models.ts";
export { PullAbortedError } from "./models.ts";
export { encodeWavPcm16 } from "./wav.ts";

export { OnnxImageToImageProvider } from "./tasks/image-to-image.ts";
export type { OnnxImageToImageOptions } from "./tasks/image-to-image.ts";
export { OnnxTextToSpeechProvider } from "./tasks/text-to-speech.ts";
export type { OnnxTextToSpeechOptions } from "./tasks/text-to-speech.ts";
export { OnnxAutomaticSpeechRecognitionProvider } from "./tasks/automatic-speech-recognition.ts";
export type { OnnxAutomaticSpeechRecognitionOptions } from "./tasks/automatic-speech-recognition.ts";
export { OnnxEmbeddingProvider } from "./tasks/feature-extraction.ts";
export type { OnnxEmbeddingOptions } from "./tasks/feature-extraction.ts";
export { createOnnxEmbeddingModel } from "./embedding-model.ts";
export type { OnnxEmbeddingModelOptions } from "./embedding-model.ts";
