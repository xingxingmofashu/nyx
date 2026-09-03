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

/** Dtypes nyx supports for local ONNX inference. */
export const DTYPE_VALUES = ["fp32", "fp16", "q8", "q4", "int8", "uint8"] as const satisfies readonly DataType[]

/** Pipeline tasks nyx supports. */
export const TASK_VALUES = ["text-generation", "image-to-image"] as const satisfies readonly PipelineType[]

/** Pipeline task as used in model metadata. */
export const ModelTaskSchema = z.enum(TASK_VALUES)
export type ModelTask = z.infer<typeof ModelTaskSchema>

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
