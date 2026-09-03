import type { ServerManager } from "./server-manager"
import type { ChatEvent, ImagePayload, ImageResult, ModelInfo, ModelTask } from "../shared/types"

/**
 * HTTP client for @nyx/server. Runs in the Electron main process and forwards
 * renderer IPC calls to the spawned inference server.
 */

export class ServerClient {
  constructor(private readonly server: ServerManager) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.server.authToken}`, "Content-Type": "application/json" }
  }

  private get baseUrl(): string {
    return this.server.url
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/health`, { headers: this.headers() })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/v1/models`, { headers: this.headers() })
    if (!res.ok) throw new Error(`models request failed: ${res.status}`)
    return (await res.json()) as ModelInfo[]
  }

  async pullModel(modelId: string, task: ModelTask): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/models/pull`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: modelId, task }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `pull failed: ${res.status}`)
    }
  }

  /**
   * Stream a chat completion. Invokes onDelta/onEnd/onError as SSE events
   * arrive. Resolves when the stream completes, errors, or is aborted.
   */
  async chat(
    modelId: string,
    message: string,
    handlers: {
      onDelta: (delta: string) => void
      onEnd: (fullText: string) => void
      onError: (message: string) => void
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/text-generation`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: modelId, message }),
      signal,
    })
    if (res.status === 499 || (signal?.aborted && !res.ok)) {
      handlers.onError("generation aborted")
      return
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      handlers.onError(body.error ?? `chat failed: ${res.status}`)
      return
    }
    if (!res.body) {
      handlers.onError("no response body")
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let event = ""
    let data = ""

    const dispatch = () => {
      if (event === "delta") {
        const parsed = JSON.parse(data) as { text: string }
        handlers.onDelta(parsed.text)
      } else if (event === "end") {
        const parsed = JSON.parse(data) as { text: string }
        handlers.onEnd(parsed.text)
      } else if (event === "error") {
        const parsed = JSON.parse(data) as { message: string }
        handlers.onError(parsed.message)
      }
      event = ""
      data = ""
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE framing: blank line separates events.
        let sep: number
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim()
            else if (line.startsWith("data:")) data += line.slice(5).trim()
          }
          dispatch()
        }
      }
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error))
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
    // Response is the encoded image stream; width/height ride in headers.
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

export type { ChatEvent }
