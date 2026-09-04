import { Agent, messageText } from "@nyx/core"
import type { AgentEvent, Message } from "@nyx/core"
import { RawImage } from "@huggingface/transformers"
import { list, pull, OnnxImageToImageProvider, OnnxTextGenerationProvider } from "@nyx/llm"
import type { LLMEvent } from "@nyx/llm"
import type { ChatMessage, ModelInfo, ModelTask } from "../shared/types"

/** Raw RGBA/RGB pixels of an image output, ready to stream back. */
export interface ImageOutput {
  data: Buffer
  width: number
  height: number
  channels: number
}

/**
 * Inference service: the process-scoped host that owns model weights and
 * runs chat turns.
 *
 * One instance exists per server process. It caches providers (and, via
 * @nyx/llm, the underlying pipelines) per model id, so weights load once.
 * Text generation is stateless multi-turn: each request carries the full
 * transcript and a fresh core Agent is seeded + discarded per turn — no
 * session is stored here.
 */
export class InferenceService {
  private readonly textProviders = new Map<string, OnnxTextGenerationProvider>()
  private readonly imageProviders = new Map<string, OnnxImageToImageProvider>()

  private textProviderFor(modelId: string): OnnxTextGenerationProvider {
    let provider = this.textProviders.get(modelId)
    if (!provider) {
      provider = new OnnxTextGenerationProvider({ model: modelId })
      this.textProviders.set(modelId, provider)
    }
    return provider
  }

  private imageProviderFor(modelId: string): OnnxImageToImageProvider {
    let provider = this.imageProviders.get(modelId)
    if (!provider) {
      provider = new OnnxImageToImageProvider({ model: modelId })
      this.imageProviders.set(modelId, provider)
    }
    return provider
  }

  /**
   * Run one chat turn over a transcript carried in `messages`. The final
   * `user` message is the prompt; everything before it (plus any leading
   * `system`) seeds the Agent. Emits token-granular text-delta events and a
   * terminal error on failure.
   */
  async *streamTextGeneration(modelId: string, messages: ChatMessage[]): AsyncIterable<LLMEvent> {
    const promptIndex = lastIndexOfRole(messages, "user")
    if (promptIndex === -1) {
      yield { type: "error", message: "messages must include a user message" }
      return
    }

    const { systemPrompt, history } = partitionMessages(messages, promptIndex)
    const agent = new Agent({
      llm: this.textProviderFor(modelId),
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      history,
    })

    const queue = new EventQueue<LLMEvent>()
    let previousText = ""
    const unsubscribe = agent.subscribe((event) => {
      const mapped = toLLMEvent(event, previousText)
      if (mapped?.type === "text-delta") previousText += mapped.delta
      if (mapped) queue.push(mapped)
      if (event.type === "agent_error" || event.type === "message_end") {
        queue.close()
      }
    })

    try {
      const run = agent.prompt(messages[promptIndex]!.content)
      // Drain events, but never hang the wire: if the turn ends without a
      // terminal event the generator still resolves.
      for (let ended = false; !ended; ) {
        for await (const event of queue.stream()) {
          ended = true
          yield event
        }
      }
      await run
    } finally {
      unsubscribe()
    }
  }

  /** Transform a single image with an image-to-image model. */
  async imageToImage(modelId: string, input: { data: string; mimeType: string }): Promise<ImageOutput> {
    const provider = this.imageProviderFor(modelId)
    const bytes = Buffer.from(input.data, "base64")
    const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
    const output = await provider.generate(source)

    return {
      data: await output.toSharp().toBuffer(),
      width: output.width,
      height: output.height,
      channels: output.channels,
    }
  }

  /** List locally installed models. */
  listModels(): ModelInfo[] {
    return list()
  }

  /** Download a model into the local cache. */
  async pullModel(modelId: string, task: ModelTask): Promise<void> {
    await pull(modelId, task)
  }
}

function lastIndexOfRole(messages: ChatMessage[], role: ChatMessage["role"]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === role) return i
  }
  return -1
}

function partitionMessages(
  messages: ChatMessage[],
  promptIndex: number,
): { systemPrompt?: string; history: Message[] } {
  let systemPrompt: string | undefined
  const history: Message[] = []

  for (let i = 0; i < promptIndex; i++) {
    const msg = messages[i]!
    if (msg.role === "system") {
      // System content rides in the Agent's systemPrompt, not its history.
      systemPrompt = systemPrompt === undefined ? msg.content : `${systemPrompt}\n${msg.content}`
    } else if (msg.role === "user") {
      history.push({ role: "user", content: msg.content, timestamp: 0 })
    } else {
      history.push({ role: "assistant", content: [{ type: "text", text: msg.content }] })
    }
  }
  return { systemPrompt, history }
}

/** Derive the incremental delta from a cumulative assistant message text. */
function toLLMEvent(event: AgentEvent, previousText: string): LLMEvent | null {
  switch (event.type) {
    case "message_update": {
      const text = messageText(event.message)
      const delta = text.startsWith(previousText) ? text.slice(previousText.length) : text
      return delta ? { type: "text-delta", delta } : null
    }
    case "agent_error":
      return { type: "error", message: event.error.message }
    default:
      return null
  }
}

/** Minimal wakeable queue: push synchronously, drain asynchronously. */
class EventQueue<T> {
  private items: T[] = []
  private waiters: Array<() => void> = []
  private closed = false

  push(item: T): void {
    this.items.push(item)
    this.waiters.splice(0).forEach((wake) => wake())
  }

  close(): void {
    this.closed = true
    this.waiters.splice(0).forEach((wake) => wake())
  }

  async *stream(): AsyncGenerator<T> {
    for (;;) {
      while (this.items.length > 0) {
        yield this.items.shift()!
      }
      if (this.closed) return
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
  }
}
