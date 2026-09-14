import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AgentModelConfig } from "./types.ts";

/**
 * Resolve a remote brain model from provider + credentials. New providers are
 * added here (one case) — the rest of the agent stays provider-agnostic.
 */
export function resolveModel(config: AgentModelConfig): LanguageModel {
  const { provider, model, apiKey, baseUrl, headers } = config;
  if (!apiKey) {
    throw new Error(`Missing API key for provider "${provider}" (set NYX_AGENT_API_KEY or ~/.nyx/settings.json)`);
  }

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL: baseUrl, headers })(model);
    case "openai-compatible": {
      if (!baseUrl) {
        throw new Error(`Provider "openai-compatible" needs a base URL (set NYX_AGENT_BASE_URL or ~/.nyx/settings.json)`);
      }
      return createOpenAICompatible({ name: "nyx", baseURL: baseUrl, apiKey, headers })(model);
    }
    default:
      throw new Error(`Unknown agent provider "${provider}"`);
  }
}
