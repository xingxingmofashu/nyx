import {
  env,
  pipeline,
  type DataType,
  type PipelineType,
  type ProgressCallback,
  type ProgressInfo,
} from "@huggingface/transformers";
import { Global } from "@nyx/global";

export type TransformersEnvironment = typeof env;

export interface ModelRuntimeOptions {
  cacheDir?: string;
  allowDownload?: boolean;
  dtype?: DataType;
  env?: Partial<TransformersEnvironment>;
  onProgress?: ProgressCallback;
}

const pipelines = new Map<string, Promise<unknown>>();

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

export async function configureEnv(options: ModelRuntimeOptions = {}): Promise<void> {
  const cacheDir = options.cacheDir ?? Global.Path.models;
  const settings = await Global.Settings.read();
  const allowDownload = options.allowDownload ?? settings.allowRemoteModels !== false;

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
    const fromSettings = settings.hubBaseUrl;
    if (fromSettings) {
      applyEnv({ remoteHost: fromSettings });
    }
  }

  const { remoteHost: _rh, ...rest } = options.env ?? {};
  applyEnv(rest as Partial<TransformersEnvironment>);
}

export async function loadPipeline<T>(
  task: PipelineType,
  model: string,
  options: ModelRuntimeOptions = {},
): Promise<T> {
  await configureEnv(options);

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

export type { ProgressInfo };

export function clearModelCache(): void {
  pipelines.clear();
}
