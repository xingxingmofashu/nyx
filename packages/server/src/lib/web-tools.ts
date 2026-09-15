import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Parser } from "htmlparser2";
import TurndownService from "turndown";
import { z } from "zod/v4";
import type { AgentToolSet } from "@nyx/agent";

/**
 * Web tools: `web_search` (hosted Exa/Parallel MCP backends, no API key needed)
 * and `web_fetch` (fetch a URL and convert it to markdown/text). Both are
 * read-only and confined to the network, so they run without approval.
 *
 * The search backends speak MCP over HTTP: a bare JSON-RPC `tools/call` POST
 * (no `initialize` handshake), answered either as JSON or as an SSE stream. The
 * hosted endpoints are used so that search works without the user configuring
 * an account.
 */

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000;
/** Cap on a buffered response body: search payloads / fetched pages. */
const MAX_SEARCH_BYTES = 256 * 1024;
const MAX_FETCH_BYTES = 5 * 1024 * 1024;
/** Mirrors the hosted tools' own bound. */
const MAX_NUM_RESULTS = 20;
const SEARCH_TIMEOUT_MS = 25_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
export const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp";
export const NO_RESULTS = "No search results found. Please try a different query.";

/** Reused when the caller has no session id (Parallel rate-limits per session). */
const FALLBACK_SESSION = crypto.randomUUID();

export type WebSearchProvider = "exa" | "parallel";

export interface WebToolsOptions {
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

const FormatSchema = z.enum(["markdown", "text", "html"]).describe("Output format (default markdown)");
type Format = z.infer<typeof FormatSchema>;

/** Build the web tools. Always returns both, since neither needs configuration. */
export function createWebTools(options: WebToolsOptions = {}): AgentToolSet {
  const provider = options.provider ?? providerFromEnv();
  const exaApiKey = options.exaApiKey ?? process.env.NYX_WEB_SEARCH_API_KEY;
  const parallelApiKey = options.parallelApiKey ?? process.env.NYX_PARALLEL_API_KEY;
  const sessionId = options.sessionId ?? FALLBACK_SESSION;

  return [
    {
      name: "web_search",
      description:
        "Search the web and return clean text content from the top results. Use it for current information " +
        "beyond your knowledge cutoff (news, releases, prices, documentation) or to verify facts.\n\n" +
        `The current year is ${new Date().getFullYear()}. Include the year when searching for recent information or events.`,
      approval: "never",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
        // Parallel's backend has no result-count knob, so don't offer one.
        ...(provider === "exa"
          ? {
              numResults: z
                .number()
                .int()
                .positive()
                .max(MAX_NUM_RESULTS)
                .optional()
                .describe(`Number of results to return (default 8, max ${MAX_NUM_RESULTS})`),
            }
          : {}),
      }),
      execute: async (input: { query: string; numResults?: number }, ctx) => {
        try {
          const text =
            provider === "parallel"
              ? await searchParallel(input.query, parallelApiKey, sessionId, ctx.signal)
              : await searchExa(input.query, input.numResults ?? 8, exaApiKey, ctx.signal);
          return clamp(text ?? NO_RESULTS);
        } catch (error) {
          // An aborted run must not look like a tool that produced an answer.
          if (ctx.signal?.aborted) throw error;
          // Otherwise surface the reason to the model instead of failing the run.
          return `Web search failed: ${errorMessage(error)}`;
        }
      },
    },
    {
      name: "web_fetch",
      description:
        "Fetch an HTTP or HTTPS URL and return its content as markdown (default), text, or HTML. " +
        "Use it to read a page found with web_search, or any URL the user gives you.",
      approval: "never",
      inputSchema: z.object({
        url: z.string().describe("The HTTP or HTTPS URL to fetch"),
        format: FormatSchema.optional(),
      }),
      execute: async ({ url, format }, ctx) => {
        try {
          return clamp(await fetchUrl(url, format ?? "markdown", ctx.signal));
        } catch (error) {
          if (ctx.signal?.aborted) throw error;
          return `Web fetch failed: ${errorMessage(error)}`;
        }
      },
    },
  ];
}

/** Exa's MCP tool; `objective` keeps the query inside the tool's required shape. */
async function searchExa(
  query: string,
  numResults: number,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const url = new URL(EXA_MCP_URL);
  if (apiKey) url.searchParams.set("exaApiKey", apiKey);
  return callMcp(
    url.toString(),
    { name: "web_search_exa", arguments: { query, objective: query, type: "auto", numResults, livecrawl: "fallback" } },
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

/** Header value used to retry a Cloudflare challenge (some sites allow non-browsers). */
const USER_AGENT = "nyx/0.1";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

async function fetchUrl(rawUrl: string, format: Format, signal?: AbortSignal): Promise<string> {
  let url = parseHttpUrl(rawUrl);

  for (let hop = 0; ; hop++) {
    // Re-checked on every hop: a redirect must not reach a private address.
    await assertPublicHost(url);

    let response = await request(url, format, BROWSER_UA, signal);
    if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
      await response.body?.cancel().catch(() => undefined);
      response = await request(url, format, USER_AGENT, signal);
    }

    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error(`HTTP ${response.status} without a Location header`);
      if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const contentType = response.headers.get("content-type") ?? "";
    const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!isTextualMime(mime)) throw new Error(`unsupported content type: ${mime || "unknown"}`);
    return convert(await readBounded(response, MAX_FETCH_BYTES), contentType, format);
  }
}

function request(url: URL, format: Format, userAgent: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": userAgent,
      Accept: acceptHeader(format),
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: withTimeout(FETCH_TIMEOUT_MS, signal),
  });
}

function acceptHeader(format: Format): string {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
    default:
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
  }
}

function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must use http:// or https://");
  }
  return url;
}

/** Refuse hosts resolving to loopback/private/link-local ranges (incl. cloud metadata). */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  if (addresses.length === 0) throw new Error(`could not resolve ${host}`);
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new Error(`refusing to fetch a private address (${host} → ${address})`);
  }
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) return isPrivateV6(address);
  const [a, b] = address.split(".").map((part) => Number.parseInt(part, 10));
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateV6(address: string): boolean {
  const value = address.toLowerCase().split("%", 1)[0] ?? "";
  if (value === "::" || value === "::1") return true;
  // `URL` normalizes IPv4-mapped addresses to hex before we see them
  // (`::ffff:127.0.0.1` arrives as `::ffff:7f00:1`), so decode the embedded
  // IPv4 rather than matching the dotted form.
  const mapped = mappedIpv4(value);
  if (mapped) return isPrivateAddress(mapped);
  return (
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("64:ff9b:")
  );
}

/** The embedded IPv4 of an IPv4-mapped IPv6 address (`::ffff:0:0/96`), if any. */
function mappedIpv4(value: string): string | undefined {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted?.[1]) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (!hex?.[1] || !hex[2]) return undefined;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function isTextualMime(mime: string): boolean {
  return (
    !mime ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  );
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

const MARKDOWN = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
MARKDOWN.remove(["script", "style", "meta", "link"]);

function convert(content: string, contentType: string, format: Format): string {
  if (!contentType.includes("text/html") && !contentType.includes("xhtml")) return content;
  if (format === "markdown") return MARKDOWN.turndown(content);
  if (format === "text") return extractText(content);
  return content;
}

/** Strip tags, dropping the contents of non-content elements. */
export function extractText(html: string): string {
  let text = "";
  let skipDepth = 0;
  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) skipDepth++;
    },
    ontext(input) {
      if (skipDepth === 0) text += input;
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--;
    },
  });
  parser.write(html);
  parser.end();
  return text.trim();
}

/** The caller's signal (if any) plus our own deadline. */
function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (truncated)` : text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
