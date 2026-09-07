import {
  env,
  pipeline,
  type DataType,
  type PipelineType,
  type ProgressCallback,
  type ProgressInfo,
} from "@huggingface/transformers";
import { getModelsDir, getSettings, DEFAULT_HUB_URL } from "@nyx/config";

/** The shape of transformers.js's mutable runtime config. */
export type TransformersEnvironment = typeof env;


export interface ModelRuntimeOptions {
  /** Where models are cached; falls back to the nyx models dir. */
  cacheDir?: string;
  /** Whether remote downloads are allowed (default true). */
  allowDownload?: boolean;
  /** Dtype passed straight to the transformers pipeline. */
  dtype?: DataType;
  /**
   * Direct overrides of transformers.js `env`, applied last so they win over
   * defaults/settings. Use `env: { remoteHost: "https://hf-mirror.com/" }`.
   */
  env?: Partial<TransformersEnvironment>;
  /** Receive model load/download progress events. */
  onProgress?: ProgressCallback;
}

const pipelines = new Map<string, Promise<unknown>>();

/** Copy a partial onto the live transformers env, normalizing trailing slashes. */
function applyEnv(partial: Partial<TransformersEnvironment>): void {
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    const k = key as keyof TransformersEnvironment;
    if (k === "remoteHost") {
      env.remoteHost = (value as string).endsWith("/") ? (value as string) : `${value}/`;
    } else {
      (env as unknown as Record<string, unknown>)[k] = value;
    }
  }
}

/** Point transformers.js at the model cache and allow remote downloads. */
export function configureEnv(options: ModelRuntimeOptions = {}): void {
  const cacheDir = options.cacheDir ?? getModelsDir();
  const allowDownload = options.allowDownload ?? true;

  // Resolve the download host once, then let explicit env overrides beat it.
  applyEnv({
    allowRemoteModels: allowDownload,
    allowLocalModels: true,
    cacheDir,
  });

  const explicit = options.env?.remoteHost;
  if (explicit) {
    applyEnv({ remoteHost: explicit });
  } else if (process.env.HF_ENDPOINT) {
    applyEnv({ remoteHost: process.env.HF_ENDPOINT });
  } else {
    const fromSettings = getSettings().hubBaseUrl;
    if (fromSettings && fromSettings !== DEFAULT_HUB_URL) {
      applyEnv({ remoteHost: fromSettings });
    }
  }

  // Remaining caller env fields (path templates, cache flags, etc.) win last.
  const { remoteHost: _rh, ...rest } = options.env ?? {};
  applyEnv(rest as Partial<TransformersEnvironment>);
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
