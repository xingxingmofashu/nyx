import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import DESCRIPTION from "./websearch.txt";

/**
 * `web_search`: search the web through a hosted Exa/Parallel MCP backend and
 * return clean text from the top results. Read-only, so it runs without
 * approval.
 *
 * The backends speak MCP over HTTP: a bare JSON-RPC `tools/call` POST (no
 * `initialize` handshake), answered either as JSON or as an SSE stream. The
 * hosted endpoints are used so that search works without the user configuring
 * an account.
 */

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;
/** Cap on a buffered search response body. */
const MAX_SEARCH_BYTES = 256 * 1024;
/** Mirrors the hosted tools' own bound. */
const MAX_NUM_RESULTS = 20;
const MAX_CONTEXT_CHARACTERS = 50_000;
const SEARCH_TIMEOUT_MS = 25_000;

/** User-Agent identifying nyx to the search backends. */
const USER_AGENT = "nyx/0.1";

export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
export const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp";
export const NO_RESULTS = "No search results found. Please try a different query.";

/** Reused when the caller has no session id (Parallel rate-limits per session). */
const FALLBACK_SESSION = crypto.randomUUID();

export type WebSearchProvider = "exa" | "parallel";

export interface WebSearchToolsOptions {
  /** Search backend; defaults to NYX_WEB_SEARCH_PROVIDER, then Exa. */
  provider?: WebSearchProvider;
  /** Optional Exa key, appended to the MCP URL as `exaApiKey`. */
  exaApiKey?: string;
  /** Optional Parallel key, sent as a bearer token. */
  parallelApiKey?: string;
  /** Stable per-session id for Parallel's free-tier accounting. */
  sessionId?: string;
}

/** NYX_WEB_SEARCH_PROVIDER, ignoring anything that isn't a known backend. */
function providerFromEnv(): WebSearchProvider {
  return process.env.NYX_WEB_SEARCH_PROVIDER === "parallel" ? "parallel" : "exa";
}

const InputSchema = z.object({
  query: z.string().describe("Websearch query"),
  numResults: z
    .number()
    .int()
    .positive()
    .max(MAX_NUM_RESULTS)
    .optional()
    .describe(`Number of search results to return (default: 8, maximum: ${MAX_NUM_RESULTS})`),
  livecrawl: z
    .enum(["fallback", "preferred"])
    .optional()
    .describe(
      "Live crawl mode - 'fallback': use live crawling as backup if cached unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
    ),
  type: z
    .enum(["auto", "fast", "deep"])
    .optional()
    .describe("Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search"),
  contextMaxCharacters: z
    .number()
    .int()
    .positive()
    .max(MAX_CONTEXT_CHARACTERS)
    .optional()
    .describe(
      `Maximum characters for context string optimized for models (default: 10000, maximum: ${MAX_CONTEXT_CHARACTERS})`,
    ),
});
type Input = z.infer<typeof InputSchema>;

/** Build the `web_search` tool. */
export function createWebSearchTools(options: WebSearchToolsOptions = {}): ToolSet {
  const provider = options.provider ?? providerFromEnv();
  const exaApiKey = options.exaApiKey ?? process.env.NYX_WEB_SEARCH_API_KEY;
  const parallelApiKey = options.parallelApiKey ?? process.env.NYX_PARALLEL_API_KEY;
  const sessionId = options.sessionId ?? FALLBACK_SESSION;

  return {
    web_search: tool({
      description:DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString()),
      inputSchema: InputSchema,
      execute: async (input: Input, { abortSignal }) => {
        try {
          // Parallel's backend has no knobs for the optional controls, so they
          // only reach Exa; `query` is all Parallel needs.
          const text =
            provider === "parallel"
              ? await searchParallel(input.query, parallelApiKey, sessionId, abortSignal)
              : await searchExa(input, exaApiKey, abortSignal);
          return clamp(text ?? NO_RESULTS);
        } catch (error) {
          // An aborted run must not look like a tool that produced an answer.
          if (abortSignal?.aborted) throw error;
          // Otherwise surface the reason to the model instead of failing the run.
          return `Web search failed: ${errorMessage(error)}`;
        }
      },
    }),
  };
}

/** Exa's MCP tool; `objective` keeps the query inside the tool's required shape. */
async function searchExa(input: Input, apiKey: string | undefined, signal?: AbortSignal): Promise<string | undefined> {
  const url = new URL(EXA_MCP_URL);
  if (apiKey) url.searchParams.set("exaApiKey", apiKey);
  return callMcp(
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
  );
}

/** Parallel's MCP tool; `session_id` is a free-tier accounting key, not a secret. */
async function searchParallel(
  query: string,
  apiKey: string | undefined,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  return callMcp(
    PARALLEL_MCP_URL,
    { name: "web_search", arguments: { objective: query, search_queries: [query], session_id: sessionId } },
    {
      "User-Agent": USER_AGENT,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal,
  );
}

/** One MCP `tools/call`, tolerating both a JSON body and an SSE stream. */
async function callMcp(
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
    signal: withTimeout(SEARCH_TIMEOUT_MS, signal),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return parseMcpText(await readBounded(response, MAX_SEARCH_BYTES));
}

const McpResultSchema = z.object({
  result: z.object({ content: z.array(z.object({ type: z.string(), text: z.string() })) }),
});

/** Pull `result.content[].text` out of a direct JSON body or an SSE `data:` line. */
export function parseMcpText(body: string): string | undefined {
  const direct = parseMcpPayload(body);
  if (direct) return direct;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = parseMcpPayload(line.slice(5));
    if (payload) return payload;
  }
  return undefined;
}

function parseMcpPayload(payload: string): string | undefined {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = McpResultSchema.safeParse(JSON.parse(trimmed));
    if (!parsed.success) return undefined;
    return parsed.data.result.content.find((item) => item.text)?.text;
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Truncate model-facing text so one tool call can't blow up the context window. */
function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (truncated)` : text;
}

/** The caller's signal (if any) plus our own deadline. */
function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Read a body, aborting once it exceeds `maxBytes` instead of buffering it whole. */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`response exceeded ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
