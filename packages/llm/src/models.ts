import { readdirSync } from "node:fs"
import { join } from "node:path"
import { getModelsDir, readModelMetaMap, writeModelMeta } from "@nyx/config"
import { downloadModel } from "./runtime.ts"
import type { ProgressInfo } from "./runtime.ts"

/**
 * Model registry helpers shared by the CLI and the inference server.
 *
 * A "pulled" model is a directory under the models cache dir (`org/name`)
 * with an entry in ~/.nyx/models.json recording how it was downloaded.
 */

export type { ModelTask } from "@nyx/config"

export interface ModelInfo {
  id: string
  task: "text-generation" | "image-to-image" | "unknown"
  dtype?: string
  pulledAt?: string
}

const TASK_DTYPES = {
  "text-generation": "q4",
  "image-to-image": "fp32",
} as const

/** List cached models by scanning the models dir and merging metadata. */
export function list(): ModelInfo[] {
  const modelsDir = getModelsDir()
  const metaMap = readModelMetaMap()
  const models: ModelInfo[] = []

  let orgs: string[] = []
  try {
    orgs = readdirSync(modelsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return models
  }

  for (const org of orgs) {
    const orgDir = join(modelsDir, org)
    let names: string[] = []
    try {
      names = readdirSync(orgDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      continue
    }
    for (const name of names) {
      const id = `${org}/${name}`
      const meta = metaMap[id]
      if (meta) {
        models.push({ id, task: meta.task, dtype: meta.dtype, pulledAt: meta.pulledAt })
      } else {
        models.push({ id, task: "unknown" })
      }
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id))
}

/** Download a model into the cache and record its metadata. */
export async function pull(
  modelId: string,
  task: "text-generation" | "image-to-image",
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  const dtype = TASK_DTYPES[task]
  await downloadModel(task, modelId, { dtype, onProgress })
  await writeModelMeta(modelId, { task, dtype, pulledAt: new Date().toISOString() })
}
