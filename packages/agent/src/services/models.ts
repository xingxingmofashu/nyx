import { LLM } from "@nyx/llm"
import type { Global } from "@nyx/global"
import { z } from "zod/v4"
import { Provider } from "../provider.ts"

export type ModelInfo = Global.ModelInfoSchemaType

export const ModelPullRequestSchema = z.object({
  model: z.string().min(1),
  task: z.enum(LLM.LLM_TASKS),
})
export type ModelPullRequest = z.infer<typeof ModelPullRequestSchema>

export const ModelIdRequestSchema = z.object({ model: z.string().min(1) })
export type ModelIdRequest = z.infer<typeof ModelIdRequestSchema>

export class Models {
  private readonly activePulls = new Map<string, AbortController>()

  constructor(private readonly cache: Provider = new Provider()) {}

  isPulling(modelId: string): boolean {
    return this.activePulls.has(modelId)
  }

  beginPull(modelId: string): AbortController {
    const controller = new AbortController()
    this.activePulls.set(modelId, controller)
    return controller
  }

  endPull(modelId: string): void {
    this.activePulls.delete(modelId)
  }

  cancelPull(modelId: string): boolean {
    const controller = this.activePulls.get(modelId)
    if (!controller) return false
    controller.abort()
    return true
  }

  async listModels(): Promise<Global.ModelInfoSchemaType[]> {
    return (await LLM.Model.list()).map((model) => ({
      id: model.id,
      name: model.name,
      task: model.task,
      ...(model.dtype ? { dtype: model.dtype } : {}),
      createdAt: model.createdAt,
    }))
  }

  async pullModel(
    modelId: string,
    task: LLM.LLMTask,
    onProgress?: (info: LLM.ProgressInfo) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await LLM.Model.pull(modelId, task, onProgress, undefined, signal)
  }

  removeModel(modelId: string): Promise<boolean> {
    this.cache.evict(modelId)
    return LLM.Model.remove(modelId)
  }
}
