import { RawImage } from "@huggingface/transformers"
import { remove, type ModelInfo } from "@nyx/config"
import { list, pull, clearModelCache, OnnxImageToImageProvider, OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMEvent, LLMProvider, LLMMessage, LLMTask, ProgressInfo } from "@nyx/llm"
import type { ImageInput } from "../shared/types"

/** Raw RGBA/RGB pixels of an image output, ready to stream back. */
export interface ImageOutput {
  data: Buffer
  width: number
  height: number
  channels: number
}

/**
 * Process-scoped host owning model weights. Caches providers per model id so
 * weights load once. Text generation is stateless multi-turn: each request
 * carries the full transcript, forwarded straight to the text provider.
 */
export class InferenceService {
  private readonly providers = new Map<string, LLMProvider>()

  private getProvider<T extends LLMProvider>(modelId: string, create: () => T): T {
    let provider = this.providers.get(modelId) as T | undefined
    if (!provider) {
      provider = create()
      this.providers.set(modelId, provider)
    }
    return provider
  }

  /** Stream one multi-turn generation over `messages` (chat template applied internally). */
  async *textGeneration(modelId: string, messages: LLMMessage[]): AsyncIterable<LLMEvent> {
    const provider = this.getProvider(modelId, () => new OnnxTextGenerationProvider({ model: modelId }))
    const input = messages.filter((m) => m.role !== "assistant" || m.content.trim() !== "")
    yield* provider.stream(input)
  }

  /** Transform a single image with an image-to-image model. */
  async imageToImage(modelId: string, input: ImageInput): Promise<ImageOutput> {
    const provider = this.getProvider(modelId, () => new OnnxImageToImageProvider({ model: modelId }))
    const bytes = Buffer.from(input.data, "base64")
    const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
    const output = await provider.generate(source)

    return {
      data: await output.toSharp().toBuffer(),
      width: output.width,
      height: output.height,
      channels: output.channels,
    }
  }

  /** List locally installed models. */
  listModels(): ModelInfo[] {
    return list()
  }

  /** Download a model into the local cache, streaming progress when a callback is given. */
  async pullModel(modelId: string, task: LLMTask, onProgress?: (info: ProgressInfo) => void): Promise<void> {
    await pull(modelId, task, onProgress)
  }

  /** Remove a model from disk and the registry; true when it was cached. */
  removeModel(modelId: string): boolean {
    if (this.providers.delete(modelId)) {
      clearModelCache()
    }
    return remove(modelId)
  }
}
