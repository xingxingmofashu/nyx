import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import DESCRIPTION from "./websearch.txt"

export type WebSearchProvider = "exa" | "parallel"

export interface WebSearchToolsOptions {
  provider?: WebSearchProvider
  exaApiKey?: string
  parallelApiKey?: string
  sessionId?: string
}

export class WebSearch {
  private static readonly MAX_SEARCH_BYTES = 256 * 1024
  private static readonly MAX_OUTPUT = 40_000
  private static readonly MAX_NUM_RESULTS = 20
  private static readonly MAX_CONTEXT_CHARACTERS = 50_000
  private static readonly SEARCH_TIMEOUT_MS = 25_000
  private static readonly USER_AGENT = "nyx/0.1"
  private static readonly EXA_MCP_URL = "https://mcp.exa.ai/mcp"
  private static readonly PARALLEL_MCP_URL = "https://search.parallel.ai/mcp"
  private static readonly NO_RESULTS = "No search results found. Please try a different query."
  private static readonly FALLBACK_SESSION = crypto.randomUUID()

  private static readonly McpResultSchema = z.object({
    result: z.object({ content: z.array(z.object({ type: z.string(), text: z.string() })) }),
  })

  static readonly InputSchema = z.object({
    query: z.string().describe("Websearch query"),
    numResults: z
      .number()
      .int()
      .positive()
      .max(WebSearch.MAX_NUM_RESULTS)
      .optional()
      .describe(`Number of search results to return (default: 8, maximum: ${WebSearch.MAX_NUM_RESULTS})`),
    livecrawl: z
      .enum(["fallback", "preferred"])
      .optional()
      .describe(
        "Live crawl mode - 'fallback': use live crawling as backup if cached unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
      ),
    type: z
      .enum(["auto", "fast", "deep"])
      .optional()
      .describe(
        "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
      ),
    contextMaxCharacters: z
      .number()
      .int()
      .positive()
      .max(WebSearch.MAX_CONTEXT_CHARACTERS)
      .optional()
      .describe(
        `Maximum characters for context string optimized for models (default: 10000, maximum: ${WebSearch.MAX_CONTEXT_CHARACTERS})`,
      ),
  })

  static create(options: WebSearchToolsOptions = {}): ToolSet {
    const provider = options.provider ?? WebSearch.providerFromEnv()
    const exaApiKey = options.exaApiKey ?? process.env.NYX_WEB_SEARCH_API_KEY
    const parallelApiKey = options.parallelApiKey ?? process.env.NYX_PARALLEL_API_KEY
    const sessionId = options.sessionId ?? WebSearch.FALLBACK_SESSION

    return {
      web_search: tool({
        description: DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString()),
        inputSchema: WebSearch.InputSchema,
        execute: async (input: WebSearchInput, { abortSignal }) => {
          try {
            const text =
              provider === "parallel"
                ? await WebSearch.searchParallel(input.query, parallelApiKey, sessionId, abortSignal)
                : await WebSearch.searchExa(input, exaApiKey, abortSignal)
            return WebSearch.truncate(text ?? WebSearch.NO_RESULTS)
          } catch (error) {
            if (abortSignal?.aborted) throw error
            return `Web search failed: ${WebSearch.errorMessage(error)}`
          }
        },
      }),
    }
  }

  private static providerFromEnv(): WebSearchProvider {
    return process.env.NYX_WEB_SEARCH_PROVIDER === "parallel" ? "parallel" : "exa"
  }

  private static async searchExa(
    input: WebSearchInput,
    apiKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const url = new URL(WebSearch.EXA_MCP_URL)
    if (apiKey) url.searchParams.set("exaApiKey", apiKey)
    return WebSearch.callMcp(
      url.toString(),
      {
        name: "web_search_exa",
        arguments: {
          query: input.query,
          objective: input.query,
          type: input.type ?? "auto",
          numResults: input.numResults ?? 8,
          livecrawl: input.livecrawl ?? "fallback",
          contextMaxCharacters: input.contextMaxCharacters,
        },
      },
      {},
      signal,
    )
  }

  private static async searchParallel(
    query: string,
    apiKey: string | undefined,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    return WebSearch.callMcp(
      WebSearch.PARALLEL_MCP_URL,
      {
        name: "web_search",
        arguments: { objective: query, search_queries: [query], session_id: sessionId },
      },
      {
        "User-Agent": WebSearch.USER_AGENT,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal,
    )
  }

  private static async callMcp(
    url: string,
    call: { name: string; arguments: Record<string, unknown> },
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: call }),
      signal: WebSearch.withTimeout(WebSearch.SEARCH_TIMEOUT_MS, signal),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
    return WebSearch.parseMcpText(await WebSearch.readBounded(response, WebSearch.MAX_SEARCH_BYTES))
  }

  private static parseMcpText(body: string): string | undefined {
    const direct = WebSearch.parseMcpPayload(body)
    if (direct) return direct
    for (const line of body.split("\n")) {
      if (!line.startsWith("data:")) continue
      const payload = WebSearch.parseMcpPayload(line.slice(5))
      if (payload) return payload
    }
    return undefined
  }

  private static parseMcpPayload(payload: string): string | undefined {
    const trimmed = payload.trim()
    if (!trimmed.startsWith("{")) return undefined
    try {
      const parsed = WebSearch.McpResultSchema.safeParse(JSON.parse(trimmed))
      if (!parsed.success) return undefined
      return parsed.data.result.content.find((item) => item.text)?.text
    } catch {
      return undefined
    }
  }

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private static truncate(value: string): string {
    return value.length > WebSearch.MAX_OUTPUT
      ? `${value.slice(0, WebSearch.MAX_OUTPUT)}\n… (truncated)`
      : value
  }

  private static withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  private static async readBounded(response: Response, maxBytes: number): Promise<string> {
    if (!response.body) return ""
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ""
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error(`response exceeded ${maxBytes} bytes`)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  }
}

export type WebSearchInput = z.infer<typeof WebSearch.InputSchema>
