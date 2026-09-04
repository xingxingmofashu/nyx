import type { PipelineType } from "@huggingface/transformers"

/** A locally installed model record. */
export interface ModelInfo {
  id: string
  name: string
  task: PipelineType
  createdAt: string
}

/** Model registry persisted at ~/.nyx/models.json. */
export interface ModelConfig {
  provider: Record<string, { models: Record<string, ModelInfo> }>
}
