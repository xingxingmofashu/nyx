import { existsSync } from "node:fs"
import { join } from "node:path"
import { pipeline, type DataType, type PipelineType } from "@huggingface/transformers"
import { getModelsDir, read as readModelConfig, write, type ModelInfo } from "@nyx/config"
import { configureEnv } from "./runtime.ts"
import type { ProgressInfo } from "./runtime.ts"

/** Default quantization per pipeline task. */
const TASK_DTYPES: Partial<Record<PipelineType, DataType>> = {
  "text-generation": "q4",
  "image-to-image": "fp32",
}

/** List installed models recorded in the config that still exist on disk. */
export function list(): ModelInfo[] {
  const modelsDir = getModelsDir()
  const config = readModelConfig()
  const models: ModelInfo[] = []

  for (const [org, { models: providerModels }] of Object.entries(config.provider)) {
    for (const [name, info] of Object.entries(providerModels)) {
      if (existsSync(join(modelsDir, org, name))) {
        models.push(info)
      }
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id))
}

/** Download a model into the cache and record it in the config. */
export async function pull(
  modelId: string,
  task: PipelineType,
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  const dtype = TASK_DTYPES[task] ?? "fp32"
  const [org, ...rest] = modelId.split("/")
  const name = rest.join("/")
  if (!org || !name) {
    throw new Error(`Invalid model id: ${modelId}`)
  }

  configureEnv()
  // Constructing the pipeline downloads config/tokenizer/weights; the
  // instance is discarded so nothing stays in memory.
  await pipeline(task, modelId, {
    dtype,
    ...(onProgress ? { progress_callback: onProgress } : {}),
  })

  const info: ModelInfo = {
    id: modelId,
    name,
    dtype,
    task,
    createdAt: new Date().toISOString(),
  }
  write({ provider: { [org]: { models: { [name]: info } } } })
}
