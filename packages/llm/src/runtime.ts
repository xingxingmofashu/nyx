import {
  env,
  pipeline,
  type PipelineType,
  type ProgressCallback,
  type ProgressInfo,
} from "@huggingface/transformers";
import { DTYPE_VALUES, getModelsDir } from "@nyx/config";

/** Quantization dtypes nyx supports, aligned with @nyx/config's list. */
export type Dtype = (typeof DTYPE_VALUES)[number];

export interface ModelRuntimeOptions {
  cacheDir?: string;
  allowDownload?: boolean;
  dtype?: Dtype;
  /** Receive model load/download progress events (transformers.js ProgressInfo). */
  onProgress?: ProgressCallback;
}

const pipelines = new Map<string, Promise<unknown>>();

export function loadPipeline<T>(
  task: PipelineType,
  model: string,
  options: ModelRuntimeOptions = {},
): Promise<T> {
  const cacheDir = options.cacheDir ?? getModelsDir();
  const allowDownload = options.allowDownload ?? true;

  env.cacheDir = cacheDir;
  env.allowRemoteModels = allowDownload;
  env.allowLocalModels = true;

  const key = `${task}:${model}`;
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

/**
 * Low-level download: cache the files needed to run a pipeline task without
 * keeping the loaded model in memory. Prefer the higher-level `pull` from
 * ./models.ts (which also records model metadata).
 */
export async function downloadModel(
  task: PipelineType,
  model: string,
  options: ModelRuntimeOptions = {},
): Promise<void> {
  const cacheDir = options.cacheDir ?? getModelsDir();
  const allowDownload = options.allowDownload ?? true;

  env.cacheDir = cacheDir;
  env.allowRemoteModels = allowDownload;
  env.allowLocalModels = true;

  // Constructing the pipeline triggers downloads for config, tokenizer,
  // processor, and weights. The instance is discarded after loading.
  await pipeline(task, model, {
    ...(options.dtype ? { dtype: options.dtype } : {}),
    ...(options.onProgress ? { progress_callback: options.onProgress } : {}),
  });
}

/** Convenience: re-export ProgressInfo for CLI progress rendering. */
export type { ProgressInfo };

export function clearModelCache(): void {
  pipelines.clear();
}
