import { list, pull } from "@nyx/llm"
import type { ModelInfo, ModelTask } from "../shared/types"

/** List installed models (records that still exist on disk). */
export function listModels(): ModelInfo[] {
  return list()
}

/** Download a model into the local cache. */
export async function pullModel(modelId: string, task: ModelTask): Promise<void> {
  await pull(modelId, task)
}
