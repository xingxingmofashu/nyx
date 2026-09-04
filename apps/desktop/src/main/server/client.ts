import type { LLMMessage, LlmTask } from "@nyx/llm"
import type { ModelInfo } from "@nyx/config"
import type { TextGenerationEvent, ImagePayload, ImageResult } from "../../shared/types"

/** HTTP transport for the @nyx/server child (main talks to it over HTTP; onnxruntime cannot run inside Electron). */
export class NyxServerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { ...this.headers(), ...init?.headers } })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `${path} failed: ${res.status}`)
    }
    return (await res.json()) as T
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.requestJson<ModelInfo[]>("/v1/models")
  }

  async pullModel(modelId: string, task: LlmTask): Promise<void> {
    await this.requestJson<{ ok: true }>("/v1/models/pull", {
      method: "POST",
      body: JSON.stringify({ model: modelId, task }),
    })
  }

  /** Stream a turn, yielding delta events then a final end/error. */
  async *textGeneration(
    modelId: string,
    messages: LLMMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<TextGenerationEvent> {
    const res = await fetch(`${this.baseUrl}/v1/text-generation`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: modelId, messages }),
      signal,
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      yield { type: "error", message: body.error ?? `text-generation failed: ${res.status}` }
      return
    }
    if (!res.body) {
      yield { type: "error", message: "no response body" }
      return
    }

    for await (const frame of readSse(res.body)) {
      yield frame
    }
  }

  async imageToImage(modelId: string, input: ImagePayload): Promise<ImageResult> {
    const res = await fetch(`${this.baseUrl}/v1/image-to-image`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: modelId,
        image: { data: Buffer.from(input.data).toString("base64"), mimeType: input.mimeType },
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `image-to-image failed: ${res.status}`)
    }
    // Response is the image stream; width/height ride in headers.
    const buf = await res.arrayBuffer()
    const width = Number(res.headers.get("x-image-width"))
    const height = Number(res.headers.get("x-image-height"))
    return {
      data: new Uint8Array(buf),
      mimeType: res.headers.get("content-type") ?? "image/png",
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
    }
  }
}

/** Parse an SSE byte stream (CRLF/LF framing, multi-line `data:` payloads). */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<TextGenerationEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let event = ""

  const emit = (data: string): TextGenerationEvent | null => {
    if (event === "delta") return { type: "delta", text: JSON.parse(data).text as string }
    if (event === "end") return { type: "end", text: JSON.parse(data).text as string }
    if (event === "error") return { type: "error", message: JSON.parse(data).message as string }
    return null
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE events are separated by a blank line.
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let data = ""
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        else if (line.startsWith("data:")) data += line.slice(5).trim()
      }
      const frame = emit(data)
      if (frame) yield frame
      event = ""
    }
  }
}
