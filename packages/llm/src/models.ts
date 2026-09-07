import { existsSync, readdirSync, rmSync, statSync } from "node:fs"
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
  // Drop weights whose local size differs from the remote file, so truncated
  // downloads can't be mistaken for complete. Degrades to a no-op offline.
  await prune(modelId)
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

interface RemoteFile {
  path: string
  type?: string
  size?: number
}

/**
 * Delete cached weights whose on-disk size differs from the remote file, so a
 * truncated download is never mistaken for complete. Only `onnx/` weights are
 * touched (config/tokenizer are tiny and rarely the truncation casualty).
 * Offline or on error, does nothing — never deletes on uncertainty.
 */
async function prune(modelId: string): Promise<void> {
  const [org, ...rest] = modelId.split("/")
  const name = rest.join("/")
  if (!org || !name) return

  const weightsDir = join(getModelsDir(), org, name, "onnx")
  if (!existsSync(weightsDir)) return

  const host = process.env.HF_ENDPOINT ?? "https://huggingface.co"
  const url = `${host.replace(/\/$/, "")}/api/models/${modelId}/tree/main/onnx?recursive=true`

  let remote: RemoteFile[]
  try {
    const res = await fetch(url)
    if (!res.ok) return
    remote = (await res.json()) as RemoteFile[]
  } catch {
    return
  }
  if (!Array.isArray(remote) || remote.length === 0) return

  const remoteMap = new Map<string, number | undefined>()
  for (const f of remote) {
    if (f.type === "file") remoteMap.set(f.path, f.size)
  }

  for (const local of readdirSync(weightsDir)) {
    const rname = `onnx/${local}`
    if (!remoteMap.has(rname) || remoteMap.get(rname) !== statSyncSafe(join(weightsDir, local))) {
      rmSync(join(weightsDir, local), { force: true })
    }
  }
}

function statSyncSafe(path: string): number | undefined {
  try {
    return statSync(path).size
  } catch {
    return undefined
  }
}
