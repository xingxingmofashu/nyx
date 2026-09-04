import {
  env,
  pipeline,
  type DataType,
  type PipelineType,
  type ProgressCallback,
  type ProgressInfo,
} from "@huggingface/transformers";
import { getModelsDir } from "@nyx/config";

export interface ModelRuntimeOptions {
  cacheDir?: string;
  allowDownload?: boolean;
  dtype?: DataType;
  /** Receive model load/download progress events. */
  onProgress?: ProgressCallback;
}

const pipelines = new Map<string, Promise<unknown>>();

/** Point transformers.js at the model cache and allow remote downloads. */
export function configureEnv(options: ModelRuntimeOptions = {}): void {
  const cacheDir = options.cacheDir ?? getModelsDir();
  const allowDownload = options.allowDownload ?? true;

  env.cacheDir = cacheDir;
  env.allowRemoteModels = allowDownload;
  env.allowLocalModels = true;
  // Honor the standard HF_ENDPOINT mirror override (e.g. https://hf-mirror.com
  // for mainland China), like the Python transformers library does.
  const endpoint = process.env.HF_ENDPOINT;
  if (endpoint) {
    env.remoteHost = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  }
}

export function loadPipeline<T>(
  task: PipelineType,
  model: string,
  options: ModelRuntimeOptions = {},
): Promise<T> {
  configureEnv(options);

  // Memoize per task:dtype:model so mixed quantization callers don't collide.
  const key = `${task}:${options.dtype ?? "default"}:${model}`;
  let pending = pipelines.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = pipeline(task, model, {
      ...(options.dtype ? { dtype: options.dtype } : {}),
      ...(options.onProgress ? { progress_callback: options.onProgress } : {}),
    }) as Promise<T>;
    pipelines.set(key, pending);
  }
  return pending;
}

/** Convenience: re-export ProgressInfo for CLI progress rendering. */
export type { ProgressInfo };

export function clearModelCache(): void {
  pipelines.clear();
}
