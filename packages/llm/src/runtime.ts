/**
 * Shared ONNX model runtime.
 *
 * All nyx models (embedding, chat, future image-to-text, ...) load through
 * this one place: cache dir, transformers.js env, and memoized lazy loading.
 * Task files stay thin — they only describe how to use their model.
 */

import { env, pipeline, type PipelineType } from "@huggingface/transformers";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ModelRuntimeOptions {
  /** Cache dir for models. Defaults to ~/.nyx/models. */
  cacheDir?: string;
  /** Allow remote model downloads. Default true. */
  allowDownload?: boolean;
  /** Quantization dtype. */
  dtype?: "fp32" | "fp16" | "q8" | "q4" | "int8" | "uint8";
}

/**
 * Load a transformers.js pipeline for a model, memoized per (task, model).
 *
 * Usage:
 *   const pipe = await loadPipeline<FeatureExtractionPipeline>("feature-extraction", modelId);
 *   const pipe = await loadPipeline<TextGenerationPipeline>("text-generation", modelId);
 *   const pipe = await loadPipeline<ImageToTextPipeline>("image-to-text", modelId);
 */
const pipelines = new Map<string, Promise<unknown>>();

export function loadPipeline<T>(
  task: PipelineType,
  model: string,
  options: ModelRuntimeOptions = {},
): Promise<T> {
  const cacheDir = options.cacheDir ?? join(homedir(), ".nyx", "models");
  const allowDownload = options.allowDownload ?? true;

  // Configure transformers.js once.
  env.cacheDir = cacheDir;
  env.allowRemoteModels = allowDownload;
  env.allowLocalModels = true;

  const key = `${task}:${model}`;
  let pending = pipelines.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = pipeline(task, model, {
      ...(options.dtype ? { dtype: options.dtype } : {}),
    }) as Promise<T>;
    pipelines.set(key, pending);
  }
  return pending;
}

/** Release all cached pipelines from memory. */
export function clearModelCache(): void {
  pipelines.clear();
}
