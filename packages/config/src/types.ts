import type { DataType, PipelineType } from "@huggingface/transformers"

/** A locally installed model record. */
export interface ModelInfo {
  id: string
  name: string
  task: PipelineType
  /** Dtype used when pulling; absent when the transformers.js default was used. */
  dtype?: DataType
  createdAt: string
}

/** Model registry persisted at ~/.nyx/models.json. */
export interface ModelConfig {
  provider: Record<string, { models: Record<string, ModelInfo> }>
}
