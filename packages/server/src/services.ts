import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getModelsDir, readModelMetaMap, writeModelMeta } from "@nyx/config"
import { OnnxImageToImageEngine, OnnxTextGenerationProvider, pullModel } from "@nyx/llm"
import type { LLMMessage, ProgressInfo } from "@nyx/llm"
import { RawImage } from "@huggingface/transformers"

/**
 * Inference + model management for the local HTTP server.
 * Runs in a plain Node process (not Electron) because onnxruntime-node
 * crashes inside Electron's Node runtime.
 */

export type ModelTask = "text-generation" | "image-to-image"

const TASK_DTYPES: Record<ModelTask, "q4" | "fp32"> = {
  "text-generation": "q4",
  "image-to-image": "fp32",
}

// --- Text generation ---

const chatProviders = new Map<string, OnnxTextGenerationProvider>()

export async function* streamChat(
  modelId: string,
  messages: LLMMessage[],
): AsyncIterable<{ type: "text-delta"; delta: string } | { type: "error"; message: string }> {
  let provider = chatProviders.get(modelId)
  if (!provider) {
    provider = new OnnxTextGenerationProvider({ model: modelId })
    chatProviders.set(modelId, provider)
  }
  yield* provider.stream(messages)
}

// --- Image-to-image ---

const imageEngines = new Map<string, OnnxImageToImageEngine>()

export interface ImageInput {
  data: string // base64
  mimeType: string
}

export interface ImageOutput {
  data: string // base64 (png)
  mimeType: string
  width: number
  height: number
}

export async function runImageToImage(modelId: string, input: ImageInput): Promise<ImageOutput> {
  let engine = imageEngines.get(modelId)
  if (!engine) {
    engine = new OnnxImageToImageEngine({ model: modelId })
    imageEngines.set(modelId, engine)
  }
  const bytes = Buffer.from(input.data, "base64")
  const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
  const output = await engine.generate(source)
  // RawImage.toBlob is browser-only; save to a temp file and read it back.
  const dir = mkdtempSync(join(tmpdir(), "nyx-img-"))
  const file = join(dir, "out.png")
  try {
    await output.save(file)
    const outBytes = readFileSync(file)
    return {
      data: outBytes.toString("base64"),
      mimeType: "image/png",
      width: output.width,
      height: output.height,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- Models ---

export interface ModelInfo {
  id: string
  task: ModelTask | "unknown"
  dtype?: string
  pulledAt?: string
}

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

export async function pullModelWithMeta(
  modelId: string,
  task: ModelTask,
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  const dtype = TASK_DTYPES[task]
  await pullModel(task, modelId, { dtype, onProgress })
  await writeModelMeta(modelId, { task, dtype, pulledAt: new Date().toISOString() })
}
