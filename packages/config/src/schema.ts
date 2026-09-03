import { z } from "zod"
import type { DataType, PipelineType } from "@huggingface/transformers"

/**
 * Zod schemas + types for nyx config, aligned with transformers.js types.
 *
 * transformers.js exports DataType / PipelineType as types only (runtime
 * constants like DATA_TYPES are not re-exported from its entry), so the value
 * lists below are declared locally and type-checked against the transformers
 * types with `satisfies` — if upstream adds/removes an entry, compilation
 * flags the drift.
 */

/** All quantization dtypes transformers.js understands. */
const DATA_TYPE_VALUES = ["auto", "fp32", "fp16", "q8", "int8", "uint8", "q4", "bnb4", "q4f16"] as const satisfies readonly DataType[]

/** Dtypes nyx actually supports for local ONNX inference. */
export const DTYPE_VALUES = ["fp32", "fp16", "q8", "q4", "int8", "uint8"] as const satisfies readonly DataType[]

/** Pipeline tasks nyx currently supports. */
export const TASK_VALUES = ["text-generation", "image-to-image"] as const satisfies readonly PipelineType[]

export const DataTypeSchema = z.enum(DATA_TYPE_VALUES)
export type ConfigDataType = z.infer<typeof DataTypeSchema>

export const TaskSchema = z.enum(TASK_VALUES)
export type Task = z.infer<typeof TaskSchema>

/** Pipeline task as used in model metadata (nyx-supported subset). */
export const ModelTaskSchema = TaskSchema
export type ModelTask = Task

/** Per-model metadata recorded in ~/.nyx/models.json. */
export const ModelMetaSchema = z.object({
  task: ModelTaskSchema,
  dtype: z.enum(DTYPE_VALUES).optional(),
  pulledAt: z.string(),
})
export type ModelMeta = z.infer<typeof ModelMetaSchema>

/** Registry of model id -> metadata. */
export const ModelMetaMapSchema = z.record(z.string(), ModelMetaSchema)
export type ModelMetaMap = z.infer<typeof ModelMetaMapSchema>
