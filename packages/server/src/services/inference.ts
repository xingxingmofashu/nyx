import { RawImage } from "@huggingface/transformers"
import { list, pull, OnnxImageToImageProvider, OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMEvent, LLMMessage } from "@nyx/llm"
import type { ChatMessage, ModelInfo, ModelTask } from "../shared/types"

/** Raw RGBA/RGB pixels of an image output, ready to stream back. */
export interface ImageOutput {
  data: Buffer
  width: number
  height: number
  channels: number
}

/**
 * Inference service: the process-scoped host that owns model weights and
 * runs inference.
 *
 * One instance exists per server process. It caches providers (and, via
 * @nyx/llm, the underlying pipelines) per model id, so weights load once.
 * Text generation is stateless multi-turn: each request carries the full
 * transcript and is forwarded straight to the text provider — no session
 * is stored here.
 */
export class InferenceService {
  private readonly textProviders = new Map<string, OnnxTextGenerationProvider>()
  private readonly imageProviders = new Map<string, OnnxImageToImageProvider>()

  private textProviderFor(modelId: string): OnnxTextGenerationProvider {
    let provider = this.textProviders.get(modelId)
    if (!provider) {
      provider = new OnnxTextGenerationProvider({ model: modelId })
      this.textProviders.set(modelId, provider)
    }
    return provider
  }

  private imageProviderFor(modelId: string): OnnxImageToImageProvider {
    let provider = this.imageProviders.get(modelId)
    if (!provider) {
      provider = new OnnxImageToImageProvider({ model: modelId })
      this.imageProviders.set(modelId, provider)
    }
    return provider
  }

  /**
   * Run one chat turn over a transcript carried in `messages`, streaming the
   * provider's token deltas straight through. The transformers.js pipeline
   * applies the model's chat template to the message array internally.
   * Empty assistant turns are dropped (they carry no content for the model).
   */
  async *streamTextGeneration(modelId: string, messages: ChatMessage[]): AsyncIterable<LLMEvent> {
    const provider = this.textProviderFor(modelId)
    const input: LLMMessage[] = messages.filter(
      (m) => !(m.role === "assistant" && m.content.trim() === ""),
    )
    for await (const event of provider.stream(input)) {
      yield event
    }
  }

  /** Transform a single image with an image-to-image model. */
  async imageToImage(modelId: string, input: { data: string; mimeType: string }): Promise<ImageOutput> {
    const provider = this.imageProviderFor(modelId)
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

  /** Download a model into the local cache. */
  async pullModel(modelId: string, task: ModelTask): Promise<void> {
    await pull(modelId, task)
  }
}
