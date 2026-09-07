import { OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMEvent, LLMMessage } from "@nyx/llm"
import { ProviderCache } from "../lib/provider-cache"

/**
 * Runs text-generation inference. Stateless multi-turn: each request carries
 * the full transcript, forwarded straight to the text provider (no session,
 * no agent engine). The chat template is applied by the provider internally.
 */
export class TextGenerationService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** Stream one multi-turn generation over `messages`. */
  async *stream(modelId: string, messages: LLMMessage[]): AsyncIterable<LLMEvent> {
    const provider = this.cache.get(modelId, () => new OnnxTextGenerationProvider({ model: modelId }))
    const input = messages.filter((m) => m.role !== "assistant" || m.content.trim() !== "")
    yield* provider.stream(input)
  }
}
