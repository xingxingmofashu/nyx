import type { LLMTask } from "@nyx/llm"
import type { ModelInfo } from "@nyx/config"
import type {
  AgentRequestInput,
  CompactRequestInput,
  KnowledgeImportRequestInput,
  KnowledgeIndexRequestInput,
  KnowledgeSearchRequestInput,
} from "@nyx/server/schema"
import type { AppType } from "@nyx/server/api"
import { parseJsonEventStream, uiMessageChunkSchema } from "ai"
import { createParser } from "eventsource-parser"
import { hc } from "hono/client"
import type {
  AudioResult,
  AudioSamples,
  CompactionResult,
  ImageBytes,
  ImageResult,
  KnowledgeDocument,
  KnowledgeImportResult,
  KnowledgeIndexProgress,
  KnowledgeSearchHit,
  KnowledgeStatus,
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

/** Thrown when an index build was cancelled (server sent the `cancelled` SSE event). */
export class IndexCancelledError extends Error {
  constructor() {
    super("Index build cancelled")
    this.name = "IndexCancelledError"
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

  async knowledgeStatus(): Promise<KnowledgeStatus> {
    const res = await this.client.v1.knowledge.$get()
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge"))
    return (await res.json()) as KnowledgeStatus
  }

  async knowledgeDocuments(): Promise<KnowledgeDocument[]> {
    const res = await this.client.v1.knowledge.documents.$get()
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/documents"))
    return (await res.json()) as KnowledgeDocument[]
  }

  /** One document's Markdown source, for the preview pane. */
  async knowledgeDocument(path: string): Promise<string> {
    const res = await this.client.v1.knowledge.document.$get({ query: { path } })
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/document"))
    return ((await res.json()) as { content: string }).content
  }

  /** Copy documents into the knowledge base; conflicts are replaced only when `overwrite`. */
  async importKnowledge(
    documents: KnowledgeImportRequestInput["documents"],
    overwrite: boolean,
  ): Promise<KnowledgeImportResult> {
    const res = await this.client.v1.knowledge.documents.$post({ json: { documents, overwrite } })
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/documents"))
    return (await res.json()) as KnowledgeImportResult
  }

  async removeKnowledge(path: string): Promise<void> {
    const res = await this.client.v1.knowledge.documents.$delete({ json: { path } })
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/documents"))
  }

  /** Build the index (or rebuild it); progress events are delivered via `onProgress`. */
  async indexKnowledge(
    rebuild: boolean,
    onProgress?: (p: KnowledgeIndexProgress) => void,
  ): Promise<{ files: number; chunks: number; skipped: number }> {
    const res = await this.client.v1.knowledge.build.$post({ json: { rebuild } as KnowledgeIndexRequestInput })
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/build"))
    if (!res.body) throw new Error("no response body")

    let stats = { files: 0, chunks: 0, skipped: 0 }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const parser = createParser({
      onEvent(event) {
        if (event.event === "progress") {
          onProgress?.(JSON.parse(event.data) as KnowledgeIndexProgress)
        } else if (event.event === "done") {
          stats = JSON.parse(event.data) as { files: number; chunks: number; skipped: number }
        } else if (event.event === "cancelled") {
          throw new IndexCancelledError()
        } else if (event.event === "error") {
          const message = (JSON.parse(event.data) as { message?: string }).message
          throw new Error(message ?? "indexing failed")
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
      // Cancelling matters when a callback threw (e.g. IndexCancelledError).
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    return stats
  }

  /** Ask the server to stop an in-flight index build. */
  async cancelKnowledgeIndex(): Promise<boolean> {
    const res = await this.client.v1.knowledge.build.cancel.$post()
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/build/cancel"))
    return ((await res.json()) as { cancelled: boolean }).cancelled
  }

  /** Retrieve passages for the page's search box. */
  async searchKnowledge(query: string, topK?: number): Promise<KnowledgeSearchHit[]> {
    const res = await this.client.v1.knowledge.search.$post({
      json: { query, ...(topK === undefined ? {} : { topK }) } as KnowledgeSearchRequestInput,
    })
    if (!res.ok) throw new Error(await errorMessage(res, "knowledge/search"))
    return (await res.json()) as KnowledgeSearchHit[]
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

  /** Summarize the transcript now (manual Compact); resolves with the checkpoint. */
  async agentCompact(body: Record<string, unknown>): Promise<CompactionResult> {
    const res = await this.client.v1.agent.compact.$post({ json: body as CompactRequestInput })
    if (!res.ok) throw new Error(await errorMessage(res, "compact"))
    return (await res.json()) as CompactionResult
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
