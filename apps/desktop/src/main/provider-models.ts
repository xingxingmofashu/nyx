import type { AgentProviderEntry, ProviderModels } from "../shared/types"

/**
 * List a provider's models over its OpenAI-compatible `/models` endpoint.
 *
 * Runs in the main process (no CORS) using the provider's own settings: the URL
 * is `modelsUrl` when set, otherwise `<baseURL>/models`; auth follows the AI SDK
 * package (bearer token for `@ai-sdk/openai-compatible`, `x-api-key` for
 * `@ai-sdk/anthropic`), with the provider's `options.headers` merged on top.
 */
export async function listProviderModels(provider: AgentProviderEntry): Promise<ProviderModels> {
  const options = provider.options ?? {}
  const defaultBase = provider.npm === "@ai-sdk/anthropic" ? "https://api.anthropic.com/v1" : undefined
  const baseURL = options.baseURL ?? defaultBase
  const base = provider.modelsUrl ?? (baseURL ? `${baseURL.replace(/\/$/, "")}/models` : undefined)
  if (!base) {
    return { ids: [], error: "Set a base URL or models URL first." }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    // Some hubs (Cloudflare-fronted) reject unknown/absent user agents.
    "User-Agent": "nyx/0.1",
    ...(options.headers ?? {}),
  }
  if (provider.npm === "@ai-sdk/anthropic") {
    if (options.apiKey) headers["x-api-key"] = options.apiKey
    headers["anthropic-version"] ??= "2023-06-01"
  } else if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }

  try {
    const res = await fetch(base, { headers, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { ids: [], error: `HTTP ${res.status} ${res.statusText}` }
    return { ids: extractModelIds(await res.json()) }
  } catch (error) {
    return { ids: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** Pull ids out of an OpenAI-style `{ data: [{ id }] }` (or a bare array) body. */
function extractModelIds(body: unknown): string[] {
  const list = Array.isArray(body)
    ? body
    : typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data)
      : []
  const ids: string[] = []
  for (const item of list) {
    const id = typeof item === "string" ? item : (item as { id?: unknown } | null)?.id
    if (typeof id === "string" && id) ids.push(id)
  }
  return ids
}
