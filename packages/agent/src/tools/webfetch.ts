import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { tool, type ToolSet } from "ai"
import { Parser } from "htmlparser2"
import TurndownService from "turndown"
import { z } from "zod/v4"
import DESCRIPTION from "./webfetch.txt"

export class WebFetch {
  private static readonly MAX_FETCH_BYTES = 5 * 1024 * 1024
  private static readonly MAX_OUTPUT = 40_000
  private static readonly DEFAULT_TIMEOUT_SECONDS = 30
  private static readonly MAX_TIMEOUT_SECONDS = 120
  private static readonly MAX_REDIRECTS = 5
  private static readonly USER_AGENT = "nyx/0.1"
  private static readonly BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
  private static readonly REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

  private static readonly MARKDOWN = (() => {
    const markdown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    })
    markdown.remove(["script", "style", "meta", "link"])
    return markdown
  })()

  static readonly FormatSchema = z
    .enum(["markdown", "text", "html"])
    .describe("Output format (default markdown)")

  static readonly InputSchema = z.object({
    url: z.string().describe("The HTTP or HTTPS URL to fetch"),
    format: WebFetch.FormatSchema.optional(),
    timeout: z
      .number()
      .gt(0)
      .lte(WebFetch.MAX_TIMEOUT_SECONDS)
      .optional()
      .describe(`Optional timeout in seconds (maximum: ${WebFetch.MAX_TIMEOUT_SECONDS})`),
  })

  static create(): ToolSet {
    return {
      web_fetch: tool({
        description: DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString()),
        inputSchema: WebFetch.InputSchema,
        execute: async (input: WebFetchInput, { abortSignal }) => {
          try {
            const timeoutMs = (input.timeout ?? WebFetch.DEFAULT_TIMEOUT_SECONDS) * 1000
            return WebFetch.truncate(
              await WebFetch.fetchUrl(input.url, input.format ?? "markdown", timeoutMs, abortSignal),
            )
          } catch (error) {
            if (abortSignal?.aborted) throw error
            return `Web fetch failed: ${WebFetch.errorMessage(error)}`
          }
        },
      }),
    }
  }

  private static async fetchUrl(
    rawUrl: string,
    format: WebFetchFormat,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<string> {
    let url = WebFetch.parseHttpUrl(rawUrl)

    for (let hop = 0; ; hop++) {
      await WebFetch.assertPublicHost(url)

      let response = await WebFetch.request(url, format, WebFetch.BROWSER_UA, timeoutMs, signal)
      if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
        await response.body?.cancel().catch(() => undefined)
        response = await WebFetch.request(url, format, WebFetch.USER_AGENT, timeoutMs, signal)
      }

      if (WebFetch.REDIRECT_STATUS.has(response.status)) {
        const location = response.headers.get("location")
        await response.body?.cancel().catch(() => undefined)
        if (!location) throw new Error(`HTTP ${response.status} without a Location header`)
        if (hop >= WebFetch.MAX_REDIRECTS) throw new Error("too many redirects")
        url = new URL(location, url)
        continue
      }

      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const contentType = response.headers.get("content-type") ?? ""
      const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
      if (!WebFetch.isTextualMime(mime)) throw new Error(`unsupported content type: ${mime || "unknown"}`)
      return WebFetch.convert(
        await WebFetch.readBounded(response, WebFetch.MAX_FETCH_BYTES),
        contentType,
        format,
      )
    }
  }

  private static request(
    url: URL,
    format: WebFetchFormat,
    userAgent: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": userAgent,
        Accept: WebFetch.acceptHeader(format),
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: WebFetch.withTimeout(timeoutMs, signal),
    })
  }

  private static acceptHeader(format: WebFetchFormat): string {
    switch (format) {
      case "markdown":
        return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
      case "text":
        return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
      default:
        return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
    }
  }

  private static parseHttpUrl(raw: string): URL {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new Error(`not a valid URL: ${raw}`)
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("URL must use http:// or https://")
    }
    if (url.protocol === "http:") url.protocol = "https:"
    return url
  }

  private static async assertPublicHost(url: URL): Promise<void> {
    const host = url.hostname.replace(/^\[|\]$/g, "")
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address)
    if (addresses.length === 0) throw new Error(`could not resolve ${host}`)
    for (const address of addresses) {
      if (WebFetch.isPrivateAddress(address)) {
        throw new Error(`refusing to fetch a private address (${host} → ${address})`)
      }
    }
  }

  private static isPrivateAddress(address: string): boolean {
    if (address.includes(":")) return WebFetch.isPrivateV6(address)
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

  private static isPrivateV6(address: string): boolean {
    const value = address.toLowerCase().split("%", 1)[0] ?? ""
    if (value === "::" || value === "::1") return true
    const mapped = WebFetch.mappedIpv4(value)
    if (mapped) return WebFetch.isPrivateAddress(mapped)
    return (
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      /^fe[89ab]/.test(value) ||
      value.startsWith("ff") ||
      value.startsWith("64:ff9b:")
    )
  }

  private static mappedIpv4(value: string): string | undefined {
    const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
    if (dotted?.[1]) return dotted[1]
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value)
    if (!hex?.[1] || !hex[2]) return undefined
    const high = Number.parseInt(hex[1], 16)
    const low = Number.parseInt(hex[2], 16)
    return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
  }

  private static isTextualMime(mime: string): boolean {
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

  private static convert(content: string, contentType: string, format: WebFetchFormat): string {
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) return content
    if (format === "markdown") return WebFetch.MARKDOWN.turndown(content)
    if (format === "text") return WebFetch.extractText(content)
    return content
  }

  private static extractText(html: string): string {
    let text = ""
    let skipDepth = 0
    const parser = new Parser({
      onopentag(name) {
        if (
          skipDepth > 0 ||
          ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)
        ) {
          skipDepth++
        }
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

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private static truncate(value: string): string {
    return value.length > WebFetch.MAX_OUTPUT
      ? `${value.slice(0, WebFetch.MAX_OUTPUT)}\n… (truncated)`
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

export type WebFetchFormat = z.infer<typeof WebFetch.FormatSchema>
export type WebFetchInput = z.infer<typeof WebFetch.InputSchema>
