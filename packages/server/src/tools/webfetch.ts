import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { tool, type ToolSet } from "ai"
import { Parser } from "htmlparser2"
import TurndownService from "turndown"
import { z } from "zod/v4"
import DESCRIPTION from "./webfetch.txt"

/**
 * `web_fetch`: fetch an HTTP(S) URL and return its content as markdown (default),
 * text, or HTML. Read-only and confined to the network, so it runs without
 * approval.
 *
 * Redirects are followed by hand and re-vetted on every hop, so a public URL can
 * never bounce into a loopback/private address (including cloud metadata).
 */

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000
const MAX_FETCH_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_SECONDS = 30
const MAX_TIMEOUT_SECONDS = 120
const MAX_REDIRECTS = 5

/** User-Agent identifying nyx to the fetched site. */
const USER_AGENT = "nyx/0.1"
/** Retried without the browser UA when a site answers with a Cloudflare challenge. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

const FormatSchema = z
  .enum(["markdown", "text", "html"])
  .describe("Output format (default markdown)")
type Format = z.infer<typeof FormatSchema>

const InputSchema = z.object({
  url: z.string().describe("The HTTP or HTTPS URL to fetch"),
  format: FormatSchema.optional(),
  timeout: z
    .number()
    .gt(0)
    .lte(MAX_TIMEOUT_SECONDS)
    .optional()
    .describe(`Optional timeout in seconds (maximum: ${MAX_TIMEOUT_SECONDS})`),
})
type Input = z.infer<typeof InputSchema>

/** Build the `web_fetch` tool; it needs no configuration. */
export function createWebFetchTool(): ToolSet {
  return {
    web_fetch: tool({
      description: DESCRIPTION.replace(
        "{{year}}",
        new Date().getFullYear().toString(),
      ),
      inputSchema: InputSchema,
      execute: async (input: Input, { abortSignal }) => {
        try {
          const timeoutMs = (input.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000
          return clamp(
            await fetchUrl(
              input.url,
              input.format ?? "markdown",
              timeoutMs,
              abortSignal,
            ),
          )
        } catch (error) {
          if (abortSignal?.aborted) throw error
          return `Web fetch failed: ${errorMessage(error)}`
        }
      },
    }),
  }
}

async function fetchUrl(
  rawUrl: string,
  format: Format,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  let url = parseHttpUrl(rawUrl)

  for (let hop = 0; ; hop++) {
    // Re-checked on every hop: a redirect must not reach a private address.
    await assertPublicHost(url)

    let response = await request(url, format, BROWSER_UA, timeoutMs, signal)
    if (
      response.status === 403 &&
      response.headers.get("cf-mitigated") === "challenge"
    ) {
      await response.body?.cancel().catch(() => undefined)
      response = await request(url, format, USER_AGENT, timeoutMs, signal)
    }

    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers.get("location")
      await response.body?.cancel().catch(() => undefined)
      if (!location)
        throw new Error(`HTTP ${response.status} without a Location header`)
      if (hop >= MAX_REDIRECTS) throw new Error("too many redirects")
      url = new URL(location, url)
      continue
    }

    if (!response.ok)
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    const contentType = response.headers.get("content-type") ?? ""
    const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
    if (!isTextualMime(mime))
      throw new Error(`unsupported content type: ${mime || "unknown"}`)
    return convert(
      await readBounded(response, MAX_FETCH_BYTES),
      contentType,
      format,
    )
  }
}

function request(
  url: URL,
  format: Format,
  userAgent: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": userAgent,
      Accept: acceptHeader(format),
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: withTimeout(timeoutMs, signal),
  })
}

function acceptHeader(format: Format): string {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
    default:
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
  }
}

function parseHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`not a valid URL: ${raw}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must use http:// or https://")
  }
  // Plain HTTP is upgraded, as the tool description promises.
  if (url.protocol === "http:") url.protocol = "https:"
  return url
}

/** Refuse hosts resolving to loopback/private/link-local ranges (incl. cloud metadata). */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((entry) => entry.address)
  if (addresses.length === 0) throw new Error(`could not resolve ${host}`)
  for (const address of addresses) {
    if (isPrivateAddress(address))
      throw new Error(
        `refusing to fetch a private address (${host} → ${address})`,
      )
  }
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) return isPrivateV6(address)
  const [a, b] = address.split(".").map((part) => Number.parseInt(part, 10))
  if (a === undefined || b === undefined) return true
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isPrivateV6(address: string): boolean {
  const value = address.toLowerCase().split("%", 1)[0] ?? ""
  if (value === "::" || value === "::1") return true
  // `URL` normalizes IPv4-mapped addresses to hex before we see them
  // (`::ffff:127.0.0.1` arrives as `::ffff:7f00:1`), so decode the embedded
  // IPv4 rather than matching the dotted form.
  const mapped = mappedIpv4(value)
  if (mapped) return isPrivateAddress(mapped)
  return (
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("64:ff9b:")
  )
}

/** The embedded IPv4 of an IPv4-mapped IPv6 address (`::ffff:0:0/96`), if any. */
function mappedIpv4(value: string): string | undefined {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
  if (dotted?.[1]) return dotted[1]
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value)
  if (!hex?.[1] || !hex[2]) return undefined
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
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
  )
}

const MARKDOWN = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
})
MARKDOWN.remove(["script", "style", "meta", "link"])

function convert(content: string, contentType: string, format: Format): string {
  if (!contentType.includes("text/html") && !contentType.includes("xhtml"))
    return content
  if (format === "markdown") return MARKDOWN.turndown(content)
  if (format === "text") return extractText(content)
  return content
}

/** Strip tags, dropping the contents of non-content elements. */
export function extractText(html: string): string {
  let text = ""
  let skipDepth = 0
  const parser = new Parser({
    onopentag(name) {
      if (
        skipDepth > 0 ||
        ["script", "style", "noscript", "iframe", "object", "embed"].includes(
          name,
        )
      )
        skipDepth++
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })
  parser.write(html)
  parser.end()
  return text.trim()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Truncate model-facing text so one tool call can't blow up the context window. */
function clamp(text: string): string {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n… (truncated)`
    : text
}

/** The caller's signal (if any) plus our own deadline. */
function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** Read a body, aborting once it exceeds `maxBytes` instead of buffering it whole. */
async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<string> {
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
