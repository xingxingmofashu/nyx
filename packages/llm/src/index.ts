// @nyx/llm — local ONNX inference engine over @nyx/config.
//
// Public surface. Everything else in this package is internal.

// Types
export type {
  Role,
  LLMMessage,
  LLMTextDelta,
  LLMEvent,
  StreamOptions,
  LLMProvider,
  TextProvider,
  ImageProvider,
  ImageSource,
} from "./types.ts";
export { LLM_TASKS, TASK_DTYPES } from "./types.ts";
export type { LlmTask } from "./types.ts";

// Runtime (shared loader / memoization)
export { configureEnv, loadPipeline, clearModelCache } from "./runtime.ts";
export type { ModelRuntimeOptions, ProgressInfo } from "./runtime.ts";

// Registry
export { list, pull } from "./models.ts";

// Task providers (one class per LlmTask)
export { OnnxTextGenerationProvider } from "./tasks/text-generation.ts";
export type { OnnxTextGenerationOptions } from "./tasks/text-generation.ts";
export { OnnxImageToImageProvider } from "./tasks/image-to-image.ts";
export type { OnnxImageToImageOptions } from "./tasks/image-to-image.ts";
