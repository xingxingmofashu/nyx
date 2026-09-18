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

export interface RuntimeOptions {
  cacheDir?: string
  allowDownload?: boolean
  dtype?: DataType
  env?: Partial<TransformersEnvironment>
  onProgress?: ProgressCallback
}

export class Runtime {
  private static readonly pipelines = new Map<string, Promise<unknown>>()

  static async cacheDir(): Promise<string> {
    const settings = await Global.Settings.read()
    return settings.huggingface?.cacheDir ?? Global.Path.models
  }

  static async configure(options: RuntimeOptions = {}): Promise<void> {
    const settings = await Global.Settings.read()
    const huggingface = settings.huggingface ?? {}
    const cacheDir = options.cacheDir ?? huggingface.cacheDir ?? Global.Path.models
    const allowDownload = options.allowDownload ?? huggingface.allowRemoteModels !== false

    Runtime.applyEnv({
      allowRemoteModels: allowDownload,
      allowLocalModels: true,
      cacheDir,
    })

    const explicit = options.env?.remoteHost
    if (explicit) {
      Runtime.applyEnv({ remoteHost: explicit })
    } else if (process.env.HF_ENDPOINT) {
      Runtime.applyEnv({ remoteHost: process.env.HF_ENDPOINT })
    } else if (huggingface.remoteHost) {
      Runtime.applyEnv({ remoteHost: huggingface.remoteHost })
    }

    const { remoteHost: _rh, ...rest } = options.env ?? {}
    Runtime.applyEnv(rest as Partial<TransformersEnvironment>)
  }

  static async pipeline<T>(task: PipelineType, model: string, options: RuntimeOptions = {}): Promise<T> {
    await Runtime.configure(options)

    const key = `${task}:${options.dtype ?? "default"}:${model}`
    let pending = Runtime.pipelines.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = createPipeline(task, model, {
        ...(options.dtype ? { dtype: options.dtype } : {}),
        ...(options.onProgress ? { progress_callback: options.onProgress } : {}),
      }) as Promise<T>
      Runtime.pipelines.set(key, pending)
    }
    return pending
  }

  static clear(): void {
    Runtime.pipelines.clear()
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
