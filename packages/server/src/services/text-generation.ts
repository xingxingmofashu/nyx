import { OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMEvent, LLMMessage } from "@nyx/llm"

/**
 * Text-generation streaming. Providers are cached per model id so weights
 * load once per process.
 */
const providers = new Map<string, OnnxTextGenerationProvider>()

export function streamTextGeneration(modelId: string, messages: LLMMessage[]): AsyncIterable<LLMEvent> {
  let provider = providers.get(modelId)
  if (!provider) {
    provider = new OnnxTextGenerationProvider({ model: modelId })
    providers.set(modelId, provider)
  }
  return provider.stream(messages)
}
