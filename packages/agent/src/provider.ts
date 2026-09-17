import { clearModelCache, type LLMProvider } from "@nyx/llm"
import { parseContextLimit } from "@nyx/shared";
import { lookupModelLimit } from "./models-dev.ts";import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AgentSettings } from "@nyx/config";
import type { ResolvedAgentModel } from "./types.ts";

const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible";
const ANTHROPIC = "@ai-sdk/anthropic";

/**
 * The agent's provider layer, in one place:
 * - builds the resolved brain config from settings and turns it into an AI SDK
 *   model (the remote provider registry);
 * - caches loaded local ONNX model providers, keyed by model id, so expensive
 *   weights are created once and reused across every inference task.
 */
export class Provider {
  private readonly cache = new Map<string, LLMProvider>()

  /** Get a cached provider or create (and cache) it via `create`. */
  get<T extends LLMProvider>(modelId: string, create: () => T): T {
    let provider = this.cache.get(modelId) as T | undefined
    if (!provider) {
      provider = create()
      this.cache.set(modelId, provider)
    }
    return provider
  }

  /** Evict a model's provider (and the underlying pipeline); true when loaded. */
  evict(modelId: string): boolean {
    if (!this.cache.delete(modelId)) return false
    clearModelCache()
    return true
  }

  /**
   * Build a resolved model config from settings: `model` is a
   * `<providerId>/<modelId>` ref resolved against the `provider` map. Throws with
   * an actionable message when the ref is missing/malformed or unknown.
   */
  static resolveModelConfig(settings: AgentSettings): ResolvedAgentModel {
    const ref = settings.model;
    const slash = ref ? ref.indexOf("/") : -1;
    if (!ref || slash <= 0) {
      throw new Error('agent.model must be "<providerId>/<modelId>" (e.g. "opencode/mimo-v2.5")');
    }
    const providerId = ref.slice(0, slash);
    const model = ref.slice(slash + 1);
    const provider = settings.provider?.[providerId];
    if (!provider) {
      throw new Error(`agent.provider.${providerId} is not configured`);
    }
    const options = provider.options ?? {};
    if (!options.apiKey) {
      throw new Error(`agent.provider.${providerId}.options.apiKey is required (or set NYX_AGENT_API_KEY)`);
    }
    if (provider.npm === OPENAI_COMPATIBLE && !options.baseURL) {
      throw new Error(`agent.provider.${providerId}.options.baseURL is required for ${OPENAI_COMPATIBLE}`);
    }
    // Limits: the provider's own config wins; otherwise fall back to the
    // models.dev catalog (by provider id, then by model id anywhere). Unknown
    // limits stay undefined so the agent never guesses a context window.
    const catalog = lookupModelLimit(providerId, model);
    const context =
      provider.limit?.context !== undefined
        ? parseContextLimit(provider.limit.context)
        : (catalog?.context ?? catalog?.input);
    const output = provider.limit?.output ?? catalog?.output;
    return {
      npm: provider.npm,
      model,
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      headers: options.headers,
      ...(output === undefined ? {} : { maxOutputTokens: output }),
      ...(context === undefined ? {} : { contextLimit: context }),
    };
  }

  /**
   * Resolve a remote brain model. The provider is selected by its AI SDK npm
   * package; new providers are added here (one case) — the agent stays
   * provider-agnostic.
   */
  static resolveModel(config: ResolvedAgentModel): LanguageModel {
    const { npm, model, apiKey, baseURL, headers } = config;
    if (!apiKey) {
      throw new Error(`Missing API key for "${npm}" (set provider options.apiKey or NYX_AGENT_API_KEY)`);
    }

    switch (npm) {
      case ANTHROPIC:
        return createAnthropic({ apiKey, baseURL, headers })(model);
      case OPENAI_COMPATIBLE: {
        if (!baseURL) {
          throw new Error(`Provider "${npm}" needs options.baseURL (set it in agent.provider.<id>.options or NYX_AGENT_BASE_URL)`);
        }
        return createOpenAICompatible({ name: "nyx", baseURL, apiKey, headers })(model);
      }
      default:
        throw new Error(`Unsupported provider package "${npm}". Supported: ${OPENAI_COMPATIBLE}, ${ANTHROPIC}.`);
    }
  }
}
