import { RawImage } from "@huggingface/transformers"
import { OnnxImageToImageProvider, OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMEvent, LLMMessage } from "@nyx/llm"
import type { ImageInput } from "../shared/types"
import { ProviderCache } from "./provider-cache"

/** Raw RGBA/RGB pixels of an image output, ready to stream back. */
export interface ImageOutput {
  data: Buffer
  width: number
  height: number
  channels: number
}

/**
 * Runs inference tasks against cached model providers. Text generation is
 * stateless multi-turn: each request carries the full transcript, forwarded
 * straight to the text provider (no session, no agent engine).
 */
export class InferenceService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** Stream one multi-turn generation over `messages` (chat template applied internally). */
  async *textGeneration(modelId: string, messages: LLMMessage[]): AsyncIterable<LLMEvent> {
    const provider = this.cache.get(modelId, () => new OnnxTextGenerationProvider({ model: modelId }))
    const input = messages.filter((m) => m.role !== "assistant" || m.content.trim() !== "")
    yield* provider.stream(input)
  }

  /** Transform a single image with an image-to-image model. */
  async imageToImage(modelId: string, input: ImageInput): Promise<ImageOutput> {
    const provider = this.cache.get(modelId, () => new OnnxImageToImageProvider({ model: modelId }))
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
}
