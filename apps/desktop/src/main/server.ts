import type { LLM } from "@nyx/llm"
import type { Agent } from "@nyx/agent"
import type { Global } from "@nyx/global"
import type { Server } from "@nyx/server"
import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
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
} from "../renderer/src/types.ts"

type AgentRequestInput = Agent.Services.AgentRequestInput
type AttachmentSaveRequest = Agent.AttachmentSaveRequest
type ChatSession = Agent.ChatSession
type ChatSessionMeta = Agent.ChatSessionMeta
type CompactRequestInput = Agent.Services.CompactRequestInput
type KnowledgeImportRequestInput = Agent.Services.KnowledgeImportRequestInput
type ModelInfo = Agent.Services.ModelInfo
type SavedAttachment = Agent.SavedAttachment
type SessionSaveRequest = Agent.SessionSaveRequest
type Settings = Global.SettingsSchemaType

type NyxClient = ReturnType<typeof hc<Server.AppType>>

export class PullCancelledError extends Error {
  constructor(modelId: string) {
    super(`Pull cancelled: ${modelId}`)
    this.name = "PullCancelledError"
  }
}

export class IndexCancelledError extends Error {
  constructor() {
    super("Index build cancelled")
    this.name = "IndexCancelledError"
  }
}

export class NyxServer {
  private static readonly READY_TIMEOUT_MS = 15_000
  private static readonly HEALTH_TIMEOUT_MS = 10_000
  private static readonly HEALTH_INTERVAL_MS = 100
  private static readonly STOP_TIMEOUT_MS = 2_000

  private child: ChildProcess | null = null
  private token = ""
  private baseURL = ""
  private httpClient: NyxClient | null = null
  private ready: Promise<void> | null = null
  private exit: Promise<number> | null = null

  async start(): Promise<void> {
    if (this.ready) return this.ready
    this.token = randomBytes(24).toString("hex")

    const { script, cwd } = this.resolveBundle()
    const child = spawn(script, [], {
      cwd,
      env: {
        ...process.env,
        NYX_SERVER_TOKEN: this.token,
        NYX_SERVER_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child
    this.exit = new Promise((resolve) => child.once("exit", (code) => resolve(code ?? 0)))

    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("nyx server did not become ready in time")),
        NyxServer.READY_TIMEOUT_MS,
      )

      let stdoutBuf = ""
      const onStdout = (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
        const match = stdoutBuf.match(/nyx-server-ready (\S+)/)
        if (match) {
          clearTimeout(timer)
          child.stdout?.off("data", onStdout)
          this.baseURL = match[1]!
          resolve()
        }
      }
      child.stdout?.on("data", onStdout)
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[nyx-server] ${chunk.toString()}`)
      })
      child.on("exit", () => {
        clearTimeout(timer)
        this.child = null
        this.baseURL = ""
        reject(new Error("nyx server exited during startup"))
      })
      child.on("error", (error) => {
        clearTimeout(timer)
        reject(new Error(`failed to spawn nyx server: ${error.message}`))
      })
    })

    try {
      await this.ready
      await this.waitForHealth()
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.ready = null
    this.exit = null
    this.httpClient = null
    this.baseURL = ""
    if (!child || child.exitCode !== null) return

    child.kill()
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve())
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL")
        resolve()
      }, NyxServer.STOP_TIMEOUT_MS)
    })
  }

  async listModels(): Promise<ModelInfo[]> {
    return (await this.client.v1.models.$get()).json()
  }

  async pullModel(
    modelId: string,
    task: LLM.LLMTask,
    onProgress?: (p: Omit<ModelPullProgress, "modelId" | "done">) => void,
  ): Promise<void> {
    const res = await this.client.v1.models.pull.$post({ json: { model: modelId, task } })
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
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  async cancelPull(modelId: string): Promise<boolean> {
    const res = await this.client.v1.models.pull.cancel.$post({ json: { model: modelId } })
    return (await res.json()).cancelled
  }

  async removeModel(modelId: string): Promise<void> {
    await this.client.v1.models.$delete({ json: { model: modelId } })
  }

  async settings(): Promise<Settings> {
    return (await this.client.v1.settings.$get()).json()
  }

  async updateSettings(patch: Settings): Promise<Settings> {
    return (await this.client.v1.settings.$patch({ json: patch })).json()
  }

  async replaceSettings(settings: Settings): Promise<Settings> {
    return (await this.client.v1.settings.$put({ json: settings })).json()
  }

  async listSessions(workspaceDir?: string): Promise<ChatSessionMeta[]> {
    const query = workspaceDir === undefined ? {} : { workspaceDir }
    return (await this.client.v1.sessions.$get({ query })).json()
  }

  async getSession(workspaceDir: string, id: string): Promise<ChatSession | null> {
    return (await this.client.v1.sessions[":id"].$get({ param: { id }, query: { workspaceDir } })).json()
  }

  async saveSession(session: SessionSaveRequest): Promise<ChatSessionMeta> {
    return (await this.client.v1.sessions.$put({ json: session })).json()
  }

  async renameSession(workspaceDir: string, id: string, title: string): Promise<ChatSessionMeta | null> {
    return (
      await this.client.v1.sessions[":id"].$patch({ param: { id }, json: { workspaceDir, title } })
    ).json()
  }

  async setSessionPinned(workspaceDir: string, id: string, pinned: boolean): Promise<ChatSessionMeta | null> {
    return (
      await this.client.v1.sessions[":id"].$patch({ param: { id }, json: { workspaceDir, pinned } })
    ).json()
  }

  async removeSession(workspaceDir: string, id: string): Promise<void> {
    await this.client.v1.sessions[":id"].$delete({ param: { id }, query: { workspaceDir } })
  }

  async activeSessionId(workspaceDir: string): Promise<string | null> {
    return (await this.client.v1.sessions.active.$get({ query: { workspaceDir } })).json()
  }

  async setActiveSessionId(workspaceDir: string, id: string | null): Promise<void> {
    await this.client.v1.sessions.active.$put({ json: { workspaceDir, id } })
  }

  async readGeneratedFileDataUrl(path: string, workspaceDir?: string): Promise<string | null> {
    const query = workspaceDir === undefined ? { path } : { path, workspaceDir }
    const res = await this.client.v1.files["data-url"].$get({ query })
    return (await res.json()).dataUrl
  }

  async saveAttachment(input: AttachmentSaveRequest): Promise<SavedAttachment> {
    return (await this.client.v1.files.attachments.$post({ json: input })).json()
  }

  async knowledgeStatus(): Promise<KnowledgeStatus> {
    return (await this.client.v1.knowledge.$get()).json()
  }

  async knowledgeDocuments(): Promise<KnowledgeDocument[]> {
    return (await this.client.v1.knowledge.documents.$get()).json()
  }

  async knowledgeDocument(path: string): Promise<string> {
    const res = await this.client.v1.knowledge.document.$get({ query: { path } })
    return (await res.json()).content
  }

  async importKnowledge(
    documents: KnowledgeImportRequestInput["documents"],
    overwrite: boolean,
  ): Promise<KnowledgeImportResult> {
    return (await this.client.v1.knowledge.documents.$post({ json: { documents, overwrite } })).json()
  }

  async removeKnowledge(path: string): Promise<void> {
    await this.client.v1.knowledge.documents.$delete({ json: { path } })
  }

  async indexKnowledge(
    rebuild: boolean,
    onProgress?: (p: KnowledgeIndexProgress) => void,
  ): Promise<{ files: number; chunks: number; skipped: number }> {
    const res = await this.client.v1.knowledge.build.$post({ json: { rebuild } })
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
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    return stats
  }

  async cancelKnowledgeIndex(): Promise<boolean> {
    const res = await this.client.v1.knowledge.build.cancel.$post()
    return (await res.json()).cancelled
  }

  async searchKnowledge(query: string, topK?: number): Promise<KnowledgeSearchHit[]> {
    const res = await this.client.v1.knowledge.search.$post({
      json: { query, ...(topK === undefined ? {} : { topK }) },
    })
    return (await res.json())
  }

  async *agent(body: Record<string, unknown>, signal?: AbortSignal): AsyncIterable<UIMessageChunk> {
    const res = await this.client.v1.agent.$post(
      { json: body as AgentRequestInput },
      { init: signal ? { signal } : undefined },
    )
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
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  async agentCompact(body: Record<string, unknown>): Promise<CompactionResult> {
    return (await this.client.v1.agent.compact.$post({ json: body as CompactRequestInput })).json()
  }

  async imageToImage(modelId: string, input: ImageBytes): Promise<ImageResult> {
    const res = await this.client.v1.tasks["image-to-image"].$post({
      json: {
        model: modelId,
        image: { data: Buffer.from(input.data).toString("base64"), mimeType: input.mimeType },
      },
    })
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
    const buf = await res.arrayBuffer()
    const samplingRate = Number(res.headers.get("x-audio-sampling-rate"))
    return {
      data: new Uint8Array(buf),
      mimeType: res.headers.get("content-type") ?? "audio/wav",
      samplingRate: Number.isFinite(samplingRate) ? samplingRate : 0,
    }
  }

  async automaticSpeechRecognition(modelId: string, input: AudioSamples): Promise<TranscriptResult> {
    return (
      await this.client.v1.tasks["automatic-speech-recognition"].$post({
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
    ).json()
  }

  private get client(): NyxClient {
    if (!this.httpClient) {
      this.httpClient = hc<Server.AppType>(this.url, {
        headers: { Authorization: `Bearer ${this.token}` },
        fetch: NyxServer.httpFetch,
      })
    }
    return this.httpClient
  }

  private get url(): string {
    if (!this.baseURL) throw new Error("nyx server is not running")
    return this.baseURL
  }

  private static async httpFetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> {
    const response = await fetch(input, init)
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `HTTP ${response.status} ${response.statusText}`)
    }
    return response
  }

  private async waitForHealth(): Promise<void> {
    const poll = async () => {
      const deadline = Date.now() + NyxServer.HEALTH_TIMEOUT_MS
      while (Date.now() < deadline) {
        if (await this.healthy()) return
        await new Promise((resolve) => setTimeout(resolve, NyxServer.HEALTH_INTERVAL_MS))
      }
      throw new Error("nyx server did not pass its health check in time")
    }
    const exited = (this.exit ?? Promise.resolve(0)).then((code) => {
      throw new Error(`nyx server exited during health check with code ${code}`)
    })
    await Promise.race([poll(), exited])
  }

  private async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/v1/health`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(3_000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private resolveBundle(): { script: string; cwd: string } {
    const bundled = join(process.resourcesPath ?? "", "runtime", "nyx-server")
    if (process.resourcesPath && existsSync(bundled)) {
      return { script: bundled, cwd: dirname(bundled) }
    }
    const serverDir = join(__dirname, "../../../../packages/server")
    const dev = join(serverDir, "dist", "nyx-server")
    if (existsSync(dev)) {
      return { script: dev, cwd: serverDir }
    }
    throw new Error("nyx server binary not found; build @nyx/server first (bun --cwd packages/server run build)")
  }
}
