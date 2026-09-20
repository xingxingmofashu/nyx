import {
  env,
  pipeline as createPipeline,
  type DataType,
  type PipelineType,
  type ProgressCallback,
  type ProgressInfo,
} from "@huggingface/transformers"
import { Global } from "@nyx/global"

export type TransformersEnvironment = typeof env

interface DisposablePipeline {
  dispose?: () => unknown
}

export interface RuntimeOptions {
  dtype?: DataType
  env?: Partial<TransformersEnvironment>
  onProgress?: ProgressCallback
}

export class Runtime {
  private static readonly pipelines = new Map<string, Promise<unknown>>()
  private static readonly loaded = new Map<string, DisposablePipeline>()

  static async cacheDir(): Promise<string> {
    const settings = await Global.Settings.read()
    return settings.huggingface?.cacheDir ?? Global.Path.models
  }

  static async configure(options: RuntimeOptions = {}): Promise<void> {
    const settings = await Global.Settings.read()
    const huggingface = settings.huggingface ?? {}

    Runtime.applyEnv({
      allowRemoteModels: huggingface.allowRemoteModels !== false,
      allowLocalModels: true,
      cacheDir: huggingface.cacheDir ?? Global.Path.models,
      remoteHost: process.env.HF_ENDPOINT ?? huggingface.remoteHost,
    })
    Runtime.applyEnv(options.env ?? {})
  }

  static async pipeline<T>(task: PipelineType, model: string, options: RuntimeOptions = {}): Promise<T> {
    await Runtime.configure(options)

    const key = `${task}:${options.dtype ?? "default"}:${model}`
    let pending = Runtime.pipelines.get(key) as Promise<T> | undefined
    if (!pending) {
      let tracked: Promise<T>
      tracked = createPipeline(task, model, {
        ...(options.dtype ? { dtype: options.dtype } : {}),
        ...(options.onProgress ? { progress_callback: options.onProgress } : {}),
      })
        .then((instance) => {
          if (Runtime.pipelines.get(key) === tracked) Runtime.loaded.set(key, instance as DisposablePipeline)
          return instance
        })
        .catch((error) => {
          Runtime.pipelines.delete(key)
          Runtime.drop(key)
          throw error
        }) as Promise<T>
      Runtime.pipelines.set(key, tracked)
      pending = tracked
    }
    return pending
  }

  static evict(model: string): void {
    for (const key of Runtime.pipelines.keys()) {
      if (!key.endsWith(`:${model}`)) continue
      Runtime.pipelines.delete(key)
      Runtime.drop(key)
    }
  }

  static clear(): void {
    for (const key of Runtime.pipelines.keys()) {
      Runtime.pipelines.delete(key)
      Runtime.drop(key)
    }
  }

  private static drop(key: string): void {
    const instance = Runtime.loaded.get(key)
    Runtime.loaded.delete(key)
    if (instance?.dispose) void instance.dispose()
  }

  private static applyEnv(partial: Partial<TransformersEnvironment>): void {
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined) continue
      const k = key as keyof TransformersEnvironment
      if (k === "remoteHost") {
        env.remoteHost = (value as string).endsWith("/") ? (value as string) : `${value}/`
      } else {
        (env as unknown as Record<string, unknown>)[k] = value
      }
    }
  }
}

export type { ProgressInfo }
