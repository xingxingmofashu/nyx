import { LLM } from "@nyx/llm"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"
import type { Global } from "@nyx/global"

export interface ResolvedModel {
  npm: string
  model: string
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  maxOutputTokens?: number
  contextLimit?: number
}

interface RemoteProvider {
  required: ReadonlyArray<"apiKey" | "baseURL">
  create: (config: ResolvedModel) => LanguageModel
}

export class Provider {
  private static readonly ANTHROPIC = "@ai-sdk/anthropic"
  private static readonly OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"
  private static readonly SCALE: Record<string, number> = { k: 1_000, m: 1_000_000 }

  private static readonly REMOTE: Record<string, RemoteProvider> = {
    [Provider.ANTHROPIC]: {
      required: ["apiKey"],
      create: ({ apiKey, baseURL, headers, model }) => createAnthropic({ apiKey, baseURL, headers })(model),
    },
    [Provider.OPENAI_COMPATIBLE]: {
      required: ["apiKey", "baseURL"],
      create: ({ apiKey, baseURL, headers, model }) => {
        if (!baseURL) throw new Error(`Provider "${Provider.OPENAI_COMPATIBLE}" needs options.baseURL`)
        return createOpenAICompatible({ name: "nyx", baseURL, apiKey, headers })(model)
      },
    },
  }

  private readonly cache = new Map<string, LLM.LLMProvider>()

  get<T extends LLM.LLMProvider>(create: () => T): T {
    const candidate = create()
    const key = `${candidate.task}:${candidate.model}`
    const cached = this.cache.get(key)
    if (cached && Provider.is(cached, candidate)) return cached
    this.cache.set(key, candidate)
    return candidate
  }

  evict(modelId: string): boolean {
    let removed = false
    for (const key of this.cache.keys()) {
      if (!key.endsWith(`:${modelId}`)) continue
      this.cache.delete(key)
      removed = true
    }
    if (!removed) return false
    LLM.Runtime.evict(modelId)
    return true
  }

  private static is<T extends LLM.LLMProvider>(cached: LLM.LLMProvider, candidate: T): cached is T {
    return cached.task === candidate.task && cached.model === candidate.model
  }

  static resolveModelConfig(settings: Global.AgentSettingsSchemaType): ResolvedModel {
    const { providerId, model } = Provider.parseRef(settings.model)
    const entry = settings.provider?.[providerId]
    if (!entry) throw new Error(`agent.provider.${providerId} is not configured`)
    const remote = Provider.REMOTE[entry.npm]
    if (!remote) throw new Error(Provider.unsupported(entry.npm))

    const options = entry.options ?? {}
    for (const field of remote.required) {
      if (!options[field]) throw new Error(`agent.provider.${providerId}.options.${field} is required`)
    }

    const context =
      entry.limit?.context === undefined ? undefined : Provider.parseLimit(entry.limit.context)
    const output = entry.limit?.output
    return {
      npm: entry.npm,
      model,
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      headers: options.headers,
      ...(output === undefined ? {} : { maxOutputTokens: output }),
      ...(context === undefined ? {} : { contextLimit: context }),
    }
  }

  static resolveModel(config: ResolvedModel): LanguageModel {
    const remote = Provider.REMOTE[config.npm]
    if (!remote) throw new Error(Provider.unsupported(config.npm))
    if (!config.apiKey) throw new Error(`Missing API key for "${config.npm}" (set provider options.apiKey)`)
    return remote.create(config)
  }

  private static parseRef(ref: string | undefined): { providerId: string; model: string } {
    const slash = ref?.indexOf("/") ?? -1
    if (!ref || slash <= 0 || slash === ref.length - 1) {
      throw new Error('agent.model must be "<providerId>/<modelId>" (e.g. "opencode/mimo-v2.5")')
    }
    return { providerId: ref.slice(0, slash), model: ref.slice(slash + 1) }
  }

  private static parseLimit(value: number | string): number | undefined {
    const match = typeof value === "string" ? /^\s*([\d.]+)\s*([km])?\s*$/i.exec(value) : null
    if (typeof value === "string" && !match) return undefined
    const scaled = match ? Number(match[1]) * (Provider.SCALE[match[2]?.toLowerCase() ?? ""] ?? 1) : value
    if (typeof scaled === "number" && Number.isFinite(scaled) && scaled > 0) return Math.round(scaled)
    return undefined
  }

  private static unsupported(npm: string): string {
    return `unsupported provider package "${npm}". Supported: ${Object.keys(Provider.REMOTE).join(", ")}.`
  }
}
