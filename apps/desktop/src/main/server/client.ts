import type { LLMTask } from "@nyx/llm"
import type { ModelInfo } from "@nyx/config"
import type {
  AudioResult,
  ImageBytes,
  ImageResult,
  ModelPullProgress,
  TextToSpeechInput,
  UIMessageChunk,
} from "../../shared/types"

/** Thrown when a pull was cancelled (server sent the `cancelled` SSE event). */
export class PullCancelledError extends Error {
  constructor(modelId: string) {
    super(`Pull cancelled: ${modelId}`)
    this.name = "PullCancelledError"
  }
}

/** HTTP transport for the @nyx/server child (main talks to it over HTTP; onnxruntime cannot run inside Electron). */
export class NyxServerClient {
  constructor(
    private readonly baseURL: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, { ...init, headers: { ...this.headers(), ...init?.headers } })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `${path} failed: ${res.status}`)
    }
    return (await res.json()) as T
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.requestJson<ModelInfo[]>("/v1/models")
  }

  /** Pull a model; download progress events are delivered via `onProgress`. */
  async pullModel(
    modelId: string,
    task: LLMTask,
    onProgress?: (p: Omit<ModelPullProgress, "modelId" | "done">) => void,
  ): Promise<void> {
    const res = await fetch(`${this.baseURL}/v1/models/pull`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: modelId, task }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `models/pull failed: ${res.status}`)
    }
    if (!res.body) throw new Error("no response body")

    for await (const { event, data } of readSseEvents(res.body)) {
      if (event === "progress") {
        const frame = JSON.parse(data) as { file?: string; loaded?: number; total?: number; percent?: number }
        onProgress?.({ file: frame.file, loaded: frame.loaded, total: frame.total, percent: frame.percent })
      } else if (event === "cancelled") {
        throw new PullCancelledError(modelId)
      } else if (event === "error") {
        const message = (JSON.parse(data) as { message?: string }).message
        throw new Error(message ?? "model pull failed")
      }
    }
  }

  /** Ask the server to stop an in-flight pull by model id. */
  async cancelPull(modelId: string): Promise<boolean> {
    const res = await this.requestJson<{ cancelled: boolean }>("/v1/models/pull/cancel", {
      method: "POST",
      body: JSON.stringify({ model: modelId }),
    })
    return res.cancelled
  }

  async removeModel(modelId: string): Promise<void> {
    await this.requestJson<{ ok: true }>("/v1/models", {
      method: "DELETE",
      body: JSON.stringify({ model: modelId }),
    })
  }

  /** Stream one agent turn over the AI SDK UI message protocol. */
  async *agent(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<UIMessageChunk> {
    const res = await fetch(`${this.baseURL}/v1/agent`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(errorBody.error ?? `agent failed: ${res.status}`)
    }
    if (!res.body) throw new Error("no response body")

    for await (const data of readSseData(res.body)) {
      if (data === "[DONE]") break
      yield JSON.parse(data) as UIMessageChunk
    }
  }

  async imageToImage(modelId: string, input: ImageBytes): Promise<ImageResult> {
    const res = await fetch(`${this.baseURL}/v1/tasks/image-to-image`, {
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

  async textToSpeech(modelId: string, input: TextToSpeechInput): Promise<AudioResult> {
    const res = await fetch(`${this.baseURL}/v1/tasks/text-to-speech`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: modelId,
        text: input.text,
        ...(input.speaker ? { speaker: input.speaker } : {}),
        ...(input.speed !== undefined ? { speed: input.speed } : {}),
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `text-to-speech failed: ${res.status}`)
    }
    // Response is the audio stream; the sample rate rides in a header.
    const buf = await res.arrayBuffer()
    const samplingRate = Number(res.headers.get("x-audio-sampling-rate"))
    return {
      data: new Uint8Array(buf),
      mimeType: res.headers.get("content-type") ?? "audio/wav",
      samplingRate: Number.isFinite(samplingRate) ? samplingRate : 0,
    }
  }
}

interface SseFrame {
  event: string
  data: string
}

/** Parse an SSE byte stream (CRLF/LF framing, multi-line `data:` payloads). */
async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<SseFrame> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let event = ""

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
      if (event && data) yield { event, data }
      event = ""
    }
  }
}

/** Parse the SSE `data:` payloads of the AI SDK UI message stream (unnamed events). */
async function* readSseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const lines = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
      if (lines.length > 0) yield lines.join("\n")
    }
  }
}
