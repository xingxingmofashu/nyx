import { listModels as listInstalledModels, pullModel as pullInstalledModel, type LLMTask, type ProgressInfo } from "@nyx/llm"
import { removeModel as removeInstalledModel, type ModelInfo } from "@nyx/config"
import { ProviderCache } from "../provider/cache"

/**
 * Model lifecycle: list cached models, download (pull) with progress, cancel an
 * in-flight pull, and remove models from disk + the provider cache. Each pull
 * is tracked by model id so a cancel can abort it.
 */
export class ModelsService {
  /** modelId → controller for the in-flight pull; lets cancelPull abort it. */
  private readonly activePulls = new Map<string, AbortController>()

  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** True when a pull for this model is already running. */
  isPulling(modelId: string): boolean {
    return this.activePulls.has(modelId)
  }

  /** Register a pull in flight; returns its controller. */
  beginPull(modelId: string): AbortController {
    const controller = new AbortController()
    this.activePulls.set(modelId, controller)
    return controller
  }

  /** Clear the in-flight marker; safe to call more than once. */
  endPull(modelId: string): void {
    this.activePulls.delete(modelId)
  }

  /** Abort the in-flight pull for a model; false when none is running. */
  cancelPull(modelId: string): boolean {
    const controller = this.activePulls.get(modelId)
    if (!controller) return false
    controller.abort()
    return true
  }

  /** List locally installed models. */
  listModels(): ModelInfo[] {
    return listInstalledModels()
  }

  /** Download a model into the local cache, streaming progress when a callback is given. */
  async pullModel(
    modelId: string,
    task: LLMTask,
    onProgress?: (info: ProgressInfo) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await pullInstalledModel(modelId, task, onProgress, undefined, signal)
  }

  /** Remove a model from disk and the provider cache; true when it was cached. */
  removeModel(modelId: string): boolean {
    this.cache.evict(modelId)
    return removeInstalledModel(modelId)
  }
}
