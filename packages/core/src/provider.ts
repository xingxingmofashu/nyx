import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AgentSettings } from "@nyx/config";
import type { ResolvedAgentModel } from "./types.ts";

const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible";
const ANTHROPIC = "@ai-sdk/anthropic";

/**
 * Build a resolved model config from settings: `model` is a
 * `<providerId>/<modelId>` ref resolved against the `provider` map. Throws with
 * an actionable message when the ref is missing/malformed or unknown.
 */
export function resolveModelConfig(settings: AgentSettings): ResolvedAgentModel {
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
  return {
    npm: provider.npm,
    model,
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
    maxOutputTokens: provider.limit?.output,
  };
}

/**
 * Resolve a remote brain model. The provider is selected by its AI SDK npm
 * package; new providers are added here (one case) — the agent stays
 * provider-agnostic.
 */
export function resolveModel(config: ResolvedAgentModel): LanguageModel {
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
