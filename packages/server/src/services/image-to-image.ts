import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RawImage } from "@huggingface/transformers"
import { OnnxImageToImageEngine } from "@nyx/llm"
import type { ImageInput, ImageOutput } from "../types"

/**
 * Image-to-image inference. Engines are cached per model id so weights load
 * once per process.
 */
const imageEngines = new Map<string, OnnxImageToImageEngine>()

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
