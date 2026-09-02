import { readdirSync } from "node:fs"
import { join } from "node:path"
import type { BrowserWindow } from "electron"
import { getModelsDir, readModelMetaMap, writeModelMeta } from "@nyx/config"
import { pullModel } from "@nyx/llm"
import type { ProgressInfo } from "@nyx/llm"
import { IPC } from "../shared/ipc"
import type { ModelInfo, ModelPullProgress, ModelTask } from "../shared/types"

/** transformers.js dtype per pipeline task (mirrors the CLI's model pull). */
const TASK_DTYPES: Record<ModelTask, "q4" | "fp32"> = {
  "text-generation": "q4",
  "image-to-image": "fp32",
}

/** List cached models by scanning the models dir and merging metadata. */
export function listModels(): ModelInfo[] {
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
        models.push({ id, task: meta.task as ModelTask, dtype: meta.dtype, pulledAt: meta.pulledAt })
      } else {
        models.push({ id, task: "unknown" })
      }
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id))
}

/** Download a model, broadcasting progress to attached windows. */
export async function pullModelWithProgress(
  modelId: string,
  task: ModelTask,
  windows: Set<BrowserWindow>,
): Promise<void> {
  const dtype = TASK_DTYPES[task]
  const broadcast = (progress: ModelPullProgress) => {
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.models.progress, progress)
    }
  }

  let lastFile = ""
  const onProgress = (info: ProgressInfo) => {
    if (info.status === "progress" && info.file !== lastFile) {
      lastFile = info.file
      broadcast({
        modelId,
        file: info.file,
        percent: info.total > 0 ? Math.round((info.loaded / info.total) * 100) : undefined,
        loaded: info.loaded,
        total: info.total,
        done: false,
      })
    }
  }

  await pullModel(task, modelId, { dtype, onProgress })
  await writeModelMeta(modelId, { task, dtype, pulledAt: new Date().toISOString() })
  broadcast({ modelId, done: true })
}
