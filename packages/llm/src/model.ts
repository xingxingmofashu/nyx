import { join } from "node:path"
import { env, pipeline, type DataType, type ProgressInfo } from "@huggingface/transformers"
import { Global } from "@nyx/global"
import fs from "fs-extra"
import { Runtime } from "./runtime.ts"

export const LLM_TASKS = [
  "image-to-image",
  "text-to-speech",
  "automatic-speech-recognition",
  "feature-extraction",
] as const
export type LLMTask = (typeof LLM_TASKS)[number]

export interface LLMProvider {
  readonly id: string
  readonly task: LLMTask
  readonly model: string
}

interface PullPlan {
  files: Map<string, number>
  weight: string
  total: number
  tree: Map<string, number>
}

export class PullAbortedError extends Error {
  constructor(modelId: string) {
    super(`Pull cancelled: ${modelId}`)
    this.name = "PullAbortedError"
  }
}

export interface CachedModel {
  id: string
  name: string
  task: LLMTask
  dtype?: DataType
  createdAt: string
  [key: string]: unknown
}

export class Model {
  static async list(): Promise<CachedModel[]> {
    const config = await Global.Models.read()
    const installed: CachedModel[] = []
    for (const [org, provider] of Object.entries(config.provider)) {
      for (const [name, info] of Object.entries(provider.models)) {
        if (await fs.pathExists(join(Global.Path.models, org, name))) installed.push(Model.asCached(info))
      }
    }
    return installed.sort((a, b) => a.id.localeCompare(b.id))
  }

  static async pull(
    modelId: string,
    task: LLMTask,
    onProgress?: (info: ProgressInfo) => void,
    dtype?: DataType,
    signal?: AbortSignal,
  ): Promise<void> {
    const [org, ...rest] = modelId.split("/")
    const name = rest.join("/")
    if (!org || !name) throw new Error(`Invalid model id: ${modelId}`)

    await Runtime.configure()
    const tree = await Model.tree(modelId)
    await Model.prune(modelId, tree)

    const plan = onProgress ? Model.plan(tree) : null
    const overall = plan ? Model.overall(plan) : null

    const progress_callback: ((info: ProgressInfo) => void) | undefined =
      signal || onProgress
        ? (info) => {
            Model.throwIfAborted(modelId, signal)
            onProgress?.(overall ? overall(info) : info)
          }
        : undefined

    await pipeline(task, modelId, {
      ...(dtype ? { dtype } : {}),
      ...(progress_callback ? { progress_callback } : {}),
    })

    Model.throwIfAborted(modelId, signal)

    const info: Global.ModelInfoSchemaType = {
      id: modelId,
      name,
      task,
      ...(dtype ? { dtype } : {}),
      createdAt: new Date().toISOString(),
    }
    await Global.Models.register({ provider: { [org]: { models: { [name]: info } } } })
  }

  static async find(modelId: string): Promise<CachedModel | undefined> {
    const config = await Global.Models.read()
    for (const provider of Object.values(config.provider)) {
      for (const info of Object.values(provider.models)) {
        if (info.id === modelId) return Model.asCached(info)
      }
    }
    return undefined
  }

  static async remove(modelId: string): Promise<boolean> {
    const [org, ...rest] = modelId.split("/")
    const name = rest.join("/")
    if (!org || !name) return false
    const dir = join(Global.Path.models, org, name)
    if (!(await fs.pathExists(dir))) return false
    await fs.remove(dir)
    const orgDir = join(Global.Path.models, org)
    if ((await fs.pathExists(orgDir)) && (await Model.readdir(orgDir)).length === 0) {
      await fs.remove(orgDir)
    }
    await Global.Models.unregister(modelId)
    return true
  }

  private static asCached(info: Global.ModelInfoSchemaType): CachedModel {
    return info as CachedModel
  }

  private static throwIfAborted(modelId: string, signal?: AbortSignal): void {
    if (signal?.aborted) throw new PullAbortedError(modelId)
  }

  private static async tree(modelId: string): Promise<Map<string, number> | null> {
    const host = env.remoteHost.replace(/\/$/, "")
    try {
      const res = await fetch(`${host}/api/models/${modelId}/tree/main?recursive=true`)
      if (!res.ok) return null
      const entries = (await res.json()) as Array<{ path?: unknown; type?: unknown; size?: unknown }>
      if (!Array.isArray(entries)) return null

      const files = new Map<string, number>()
      for (const entry of entries) {
        if (entry.type === "file" && typeof entry.path === "string" && typeof entry.size === "number") {
          files.set(entry.path, entry.size)
        }
      }
      return files.size > 0 ? files : null
    } catch {
      return null
    }
  }

  private static plan(tree: Map<string, number> | null): PullPlan | null {
    if (!tree) return null

    const weight = Model.pickWeightFile(tree)
    const files = new Map<string, number>()
    for (const [path, size] of tree) {
      if (!path.includes("/") && !path.startsWith(".") && !path.toLowerCase().endsWith(".md")) {
        files.set(path, size)
      }
    }
    if (weight) {
      for (const [path, size] of tree) {
        if (path === weight || path.startsWith(`${weight}_data`)) files.set(path, size)
      }
    }

    let total = 0
    for (const size of files.values()) total += size
    return total > 0 ? { files, weight, total, tree } : null
  }

  private static overall(plan: PullPlan): (info: ProgressInfo) => ProgressInfo {
    let total = plan.total
    let predicted = plan.weight
    let completed = 0
    let loaded = 0
    const counted = new Set<string>(plan.files.keys())
    const finished = new Set<string>()

    const sizeOf = (file: string): number | undefined => plan.tree.get(file)

    return (info) => {
      if (info.status === "initiate" || info.status === "download") {
        if (info.file.endsWith(".onnx") && sizeOf(info.file) !== undefined) {
          if (predicted) {
            if (info.file !== predicted) total -= sizeOf(predicted) ?? 0
            predicted = ""
          }
          if (!counted.has(info.file)) {
            counted.add(info.file)
            total += sizeOf(info.file) ?? 0
          }
        }
        return info
      }

      if (info.status === "progress") {
        loaded = info.loaded
        const overall = Math.min(completed + loaded, total)
        return { ...info, loaded: overall, total, progress: total > 0 ? (overall / total) * 100 : 0 }
      }

      if (info.status === "done" && !finished.has(info.file)) {
        finished.add(info.file)
        completed += sizeOf(info.file) ?? loaded
        loaded = 0
      }
      return info
    }
  }

  private static pickWeightFile(tree: Map<string, number>): string {
    const candidates = [...tree.keys()].filter((path) => /^onnx\/[^/]+\.onnx$/.test(path))
    for (const preferred of ["onnx/model.onnx", "onnx/model_quantized.onnx"]) {
      if (candidates.includes(preferred)) return preferred
    }
    return candidates.length === 1 ? (candidates[0] ?? "") : ""
  }

  private static async prune(modelId: string, tree: Map<string, number> | null): Promise<void> {
    const [org, ...rest] = modelId.split("/")
    const name = rest.join("/")
    if (!org || !name || !tree) return

    const weightsDir = join(Global.Path.models, org, name, "onnx")
    if (!(await fs.pathExists(weightsDir))) return

    const remote = new Map<string, number>()
    for (const [path, size] of tree) {
      if (path.startsWith("onnx/")) remote.set(path, size)
    }

    for (const local of await Model.readdir(weightsDir)) {
      if (remote.get(`onnx/${local}`) !== (await Model.size(join(weightsDir, local)))) {
        await fs.remove(join(weightsDir, local))
      }
    }
  }

  private static async size(path: string): Promise<number | undefined> {
    try {
      return (await fs.stat(path)).size
    } catch {
      return undefined
    }
  }

  private static async readdir(dir: string): Promise<string[]> {
    return fs.readdir(dir).catch(() => [] as string[])
  }
}
