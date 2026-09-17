import { existsSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { pipeline, type DataType } from "@huggingface/transformers"
import { getModelsDir, readModelConfig, writeModelConfig, type ModelInfo } from "@nyx/config"
import { configureEnv } from "./runtime.ts"
import type { ProgressInfo } from "./runtime.ts"
import { createOverallProgress, fetchRepoTree, planPull } from "./pull-progress.ts"
import type { LLMTask } from "./types.ts"

/** Thrown when a pull is cancelled mid-download. */
export class PullAbortedError extends Error {
  constructor(modelId: string) {
    super(`Pull cancelled: ${modelId}`)
    this.name = "PullAbortedError"
  }
}

function throwIfAborted(modelId: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw new PullAbortedError(modelId)
}

/** List models recorded in the config that still exist on disk. */
export function listModels(): ModelInfo[] {
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
export async function pullModel(
  modelId: string,
  task: LLMTask,
  onProgress?: (info: ProgressInfo) => void,
  dtype?: DataType,
  signal?: AbortSignal,
): Promise<void> {
  const [org, ...rest] = modelId.split("/")
  const name = rest.join("/")
  if (!org || !name) {
    throw new Error(`Invalid model id: ${modelId}`)
  }

  configureEnv()
  // One listing of the repo covers both jobs below: dropping weights left
  // truncated by an earlier run, and knowing how much this pull will download.
  // Null (offline, gated) degrades to a no-op and to per-file progress.
  const tree = await fetchRepoTree(modelId)
  await prune(modelId, tree)

  const plan = onProgress ? planPull(tree) : null
  const overall = plan ? createOverallProgress(plan) : null

  // Without a signal and without a listener transformers.js takes the
  // arrayBuffer fast path, so the wrapper is only installed when someone is
  // watching. A signal makes it the abort lever: transformers fires it per read
  // chunk on the streaming download path, so throwing from it stops the current
  // file write and unwinds the whole pipeline load.
  const progress_callback: ((info: ProgressInfo) => void) | undefined =
    signal || onProgress
      ? (info) => {
          throwIfAborted(modelId, signal)
          onProgress?.(overall ? overall(info) : info)
        }
      : undefined

  // Loading the pipeline downloads config/tokenizer/weights; discard the instance.
  await pipeline(task, modelId, {
    ...(dtype ? { dtype } : {}),
    ...(progress_callback ? { progress_callback } : {}),
  })

  // An abort landing between the last chunk and registration must not cache.
  throwIfAborted(modelId, signal)

  const info: ModelInfo = {
    id: modelId,
    name,
    task,
    ...(dtype ? { dtype } : {}),
    createdAt: new Date().toISOString(),
  }
  writeModelConfig({ provider: { [org]: { models: { [name]: info } } } })
}

/** Find a recorded model by id; undefined when not cached. */
export function findModel(modelId: string): ModelInfo | undefined {
  const config = readModelConfig()
  for (const [org, { models: providerModels }] of Object.entries(config.provider)) {
    for (const [name, info] of Object.entries(providerModels)) {
      if (info.id === modelId) return info
    }
  }
  return undefined
}

/**
 * Delete cached weights whose on-disk size differs from the remote file, so a
 * truncated download is never mistaken for complete. Only `onnx/` weights are
 * touched (config/tokenizer are tiny and rarely the truncation casualty).
 * Offline or on error, does nothing — never deletes on uncertainty.
 */
function prune(modelId: string, tree: Map<string, number> | null): void {
  const [org, ...rest] = modelId.split("/")
  const name = rest.join("/")
  if (!org || !name) return

  const weightsDir = join(getModelsDir(), org, name, "onnx")
  if (!existsSync(weightsDir) || !tree) return

  const remote = new Map<string, number>()
  for (const [path, size] of tree) {
    if (path.startsWith("onnx/")) remote.set(path, size)
  }

  for (const local of readdirSync(weightsDir)) {
    if (remote.get(`onnx/${local}`) !== statSyncSafe(join(weightsDir, local))) {
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
