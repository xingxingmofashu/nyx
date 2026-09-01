import { env, pipeline, type PipelineType } from "@huggingface/transformers";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ModelRuntimeOptions {
  cacheDir?: string;
  allowDownload?: boolean;
  dtype?: "fp32" | "fp16" | "q8" | "q4" | "int8" | "uint8";
}

const pipelines = new Map<string, Promise<unknown>>();

export function loadPipeline<T>(
  task: PipelineType,
  model: string,
  options: ModelRuntimeOptions = {},
): Promise<T> {
  const cacheDir = options.cacheDir ?? join(homedir(), ".nyx", "models");
  const allowDownload = options.allowDownload ?? true;

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

export function clearModelCache(): void {
  pipelines.clear();
}
