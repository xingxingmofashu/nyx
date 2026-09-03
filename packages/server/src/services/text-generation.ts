import { OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMMessage } from "@nyx/llm"

/**
 * Text-generation streaming. Providers are cached per model id so weights
 * load once per process.
 */
const providers = new Map<string, OnnxTextGenerationProvider>()

export async function* streamTextGeneration(
  modelId: string,
  messages: LLMMessage[],
): AsyncIterable<{ type: "text-delta"; delta: string } | { type: "error"; message: string }> {
  let provider = providers.get(modelId)
  if (!provider) {
    provider = new OnnxTextGenerationProvider({ model: modelId })
    providers.set(modelId, provider)
  }
  yield* provider.stream(messages)
}
