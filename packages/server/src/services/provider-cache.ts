import { clearModelCache, type LLMProvider } from "@nyx/llm"

/**
 * Process-scoped cache of loaded model providers, keyed by model id. Loading a
 * model's weights is expensive, so providers are created once and reused; the
 * cache is shared by every inference task that touches the same model.
 */
export class ProviderCache {
  private readonly providers = new Map<string, LLMProvider>()

  /** Get a cached provider or create (and cache) it via `create`. */
  get<T extends LLMProvider>(modelId: string, create: () => T): T {
    let provider = this.providers.get(modelId) as T | undefined
    if (!provider) {
      provider = create()
      this.providers.set(modelId, provider)
    }
    return provider
  }

  /** Evict a model's provider (and the underlying pipeline); true when loaded. */
  evict(modelId: string): boolean {
    if (!this.providers.delete(modelId)) return false
    clearModelCache()
    return true
  }
}
