import type { DataType, PipelineType } from "@huggingface/transformers"

/** A locally installed model record. */
export interface ModelInfo {
  id: string
  name: string
  dtype:DataType
  task: PipelineType
  createdAt: string
}

/**
 * Config of locally installed models, persisted at ~/.nyx/models.json:
 * { provider: { <provider>: { models: { <name>: InstalledModel } } } }
 */
export interface ModelConfig {
  provider: Record<string, { models: Record<string, ModelInfo> }>
}
