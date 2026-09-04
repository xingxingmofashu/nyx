import { existsSync } from "node:fs"
import { join } from "node:path"
import { pipeline, type DataType } from "@huggingface/transformers"
import { getModelsDir, read as readModelConfig, write, type ModelInfo } from "@nyx/config"
import { configureEnv } from "./runtime.ts"
import type { ProgressInfo } from "./runtime.ts"
import type { LlmTask } from "./types.ts"

/** List models recorded in the config that still exist on disk. */
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

/**
 * Download a model into the cache and record it in the config.
 * `dtype` is an advanced option; when omitted, transformers.js picks the
 * device default.
 */
export async function pull(
  modelId: string,
  task: LlmTask,
  onProgress?: (info: ProgressInfo) => void,
  dtype?: DataType,
): Promise<void> {
  const [org, ...rest] = modelId.split("/")
  const name = rest.join("/")
  if (!org || !name) {
    throw new Error(`Invalid model id: ${modelId}`)
  }

  configureEnv()
  // Loading the pipeline downloads config/tokenizer/weights; discard the instance.
  await pipeline(task, modelId, {
    ...(dtype ? { dtype } : {}),
    ...(onProgress ? { progress_callback: onProgress } : {}),
  })

  const info: ModelInfo = {
    id: modelId,
    name,
    task,
    ...(dtype ? { dtype } : {}),
    createdAt: new Date().toISOString(),
  }
  write({ provider: { [org]: { models: { [name]: info } } } })
}

/** Find a recorded model by id; undefined when not cached. */
export function find(modelId: string): ModelInfo | undefined {
  const config = readModelConfig()
  for (const [org, { models: providerModels }] of Object.entries(config.provider)) {
    for (const [name, info] of Object.entries(providerModels)) {
      if (info.id === modelId) return info
    }
  }
  return undefined
}
