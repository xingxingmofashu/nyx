import type { LLMTask } from "@nyx/llm"
import type { ModelInfo } from "@nyx/config"
import type { AgentRequestInput } from "@nyx/server/schema"
import type { AppType } from "@nyx/server/api"
import { parseJsonEventStream, uiMessageChunkSchema } from "ai"
import { createParser } from "eventsource-parser"
import { hc } from "hono/client"
import type {
  AudioResult,
  AudioSamples,
  ImageBytes,
  ImageResult,
  ModelPullProgress,
  TextToSpeechInput,
  TranscriptResult,
  UIMessageChunk,
} from "../../shared/types"

/** Route-typed Hono client; paths, methods, and JSON bodies are inferred. */
type NyxClient = ReturnType<typeof hc<AppType>>

/** Thrown when a pull was cancelled (server sent the `cancelled` SSE event). */
export class PullCancelledError extends Error {
  constructor(modelId: string) {
    super(`Pull cancelled: ${modelId}`)
    this.name = "PullCancelledError"
  }
}

/** Read the server's `{ error }` JSON, falling back to a status line. */
async function errorMessage(
  res: { json: () => Promise<unknown>; status: number },
  fallback: string,
): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? `${fallback}: ${res.status}`
}

/**
 * HTTP transport for the @nyx/server child (main talks to it over HTTP;
 * onnxruntime cannot run inside Electron). Uses Hono RPC for path/method/body
 * typing; streaming and raw-byte responses are consumed by hand by design.
 */
export class NyxServerClient {
  private readonly client: NyxClient

  constructor(baseURL: string, token: string) {
    this.client = hc<AppType>(baseURL, { headers: { Authorization: `Bearer ${token}` } })
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.client.v1.models.$get()
    if (!res.ok) throw new Error(await errorMessage(res, "models"))
    return (await res.json()) as ModelInfo[]
  }

  /** Pull a model; download progress events are delivered via `onProgress`. */
  async pullModel(
    modelId: string,
    task: LLMTask,
    onProgress?: (p: Omit<ModelPullProgress, "modelId" | "done">) => void,
  ): Promise<void> {
    const res = await this.client.v1.models.pull.$post({ json: { model: modelId, task } })
    if (!res.ok) throw new Error(await errorMessage(res, "models/pull"))
    if (!res.body) throw new Error("no response body")

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const parser = createParser({
      onEvent(event) {
        if (event.event === "progress") {
          const frame = JSON.parse(event.data) as { file?: string; loaded?: number; total?: number; percent?: number }
          onProgress?.({ file: frame.file, loaded: frame.loaded, total: frame.total, percent: frame.percent })
        } else if (event.event === "cancelled") {
          throw new PullCancelledError(modelId)
        } else if (event.event === "error") {
          const message = (JSON.parse(event.data) as { message?: string }).message
          throw new Error(message ?? "model pull failed")
        }
      },
    })

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }
    } finally {
      // Cancelling matters when a callback threw (e.g. PullCancelledError).
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  /** Ask the server to stop an in-flight pull by model id. */
  async cancelPull(modelId: string): Promise<boolean> {
    const res = await this.client.v1.models.pull.cancel.$post({ json: { model: modelId } })
    if (!res.ok) throw new Error(await errorMessage(res, "models/pull/cancel"))
    return ((await res.json()) as { cancelled: boolean }).cancelled
  }

  async removeModel(modelId: string): Promise<void> {
    const res = await this.client.v1.models.$delete({ json: { model: modelId } })
    if (!res.ok) throw new Error(await errorMessage(res, "models"))
  }

  /** Stream one agent turn over the AI SDK UI message protocol. */
  async *agent(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<UIMessageChunk> {
    const res = await this.client.v1.agent.$post(
      { json: body as AgentRequestInput },
      { init: signal ? { signal } : undefined },
    )

    if (!res.ok) throw new Error(await errorMessage(res, "agent"))
    if (!res.body) throw new Error("no response body")

    const chunkStream = parseJsonEventStream({ stream: res.body, schema: uiMessageChunkSchema })
    const reader = chunkStream.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value.success) throw new Error(`invalid agent stream chunk: ${value.error.message}`)
        yield value.value as UIMessageChunk
      }
    } finally {
      reader.releaseLock()
    }
  }

  async imageToImage(modelId: string, input: ImageBytes): Promise<ImageResult> {
    const res = await this.client.v1.tasks["image-to-image"].$post({
      json: {
        model: modelId,
        image: { data: Buffer.from(input.data).toString("base64"), mimeType: input.mimeType },
      },
    })
    if (!res.ok) throw new Error(await errorMessage(res, "image-to-image"))
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
    const res = await this.client.v1.tasks["text-to-speech"].$post({
      json: {
        model: modelId,
        text: input.text,
        ...(input.speaker ? { speaker: input.speaker } : {}),
        ...(input.speed !== undefined ? { speed: input.speed } : {}),
      },
    })
    if (!res.ok) throw new Error(await errorMessage(res, "text-to-speech"))
    // Response is the audio stream; the sample rate rides in a header.
    const buf = await res.arrayBuffer()
    const samplingRate = Number(res.headers.get("x-audio-sampling-rate"))
    return {
      data: new Uint8Array(buf),
      mimeType: res.headers.get("content-type") ?? "audio/wav",
      samplingRate: Number.isFinite(samplingRate) ? samplingRate : 0,
    }
  }

  /** Transcribe mono PCM samples; the server responds with JSON text. */
  async automaticSpeechRecognition(modelId: string, input: AudioSamples): Promise<TranscriptResult> {
    const res = await this.client.v1.tasks["automatic-speech-recognition"].$post({
      json: {
        model: modelId,
        audio: {
          data: Buffer.from(
            input.samples.buffer,
            input.samples.byteOffset,
            input.samples.byteLength,
          ).toString("base64"),
          samplingRate: input.samplingRate,
        },
      },
    })
    if (!res.ok) throw new Error(await errorMessage(res, "automatic-speech-recognition"))
    return (await res.json()) as TranscriptResult
  }
}
