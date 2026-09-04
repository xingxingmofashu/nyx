import type { TextProvider, LLMMessage } from "@nyx/llm"
import type { AssistantMessage, Message, TextContent, UserMessage } from "../types"
import { messageToJson } from "../types"

export type AgentEvent =
  | { type: "message_start"; message: UserMessage | AssistantMessage }
  | { type: "message_update"; message: AssistantMessage }
  | { type: "message_end"; message: AssistantMessage }
  | { type: "agent_error"; error: Error }

export type AgentEventListener = (event: AgentEvent) => void

export interface ChatResult {
  /** The model's reply text. */
  text: string
  /** The assistant message as recorded in the session history. */
  message: AssistantMessage
}

export interface AgentOptions {
  llm: TextProvider
  systemPrompt?: string
  /**
   * Seed the transcript with a prior conversation (e.g. history a stateless
   * caller carries in). Copied at construction; later turns append on top.
   * The system prompt is not part of this array — pass it via `systemPrompt`.
   */
  history?: Message[]
}

const DEFAULT_SYSTEM_PROMPT = "You are nyx, a helpful local assistant. Answer concisely."

/** Extract the plain text of a message, joining text blocks (thinking/image/tool ignored). */
export function messageText(message: Message): string {
  if (message.role === "user") {
    return typeof message.content === "string" ? message.content : textOfBlocks(message.content)
  }
  return textOfBlocks(message.content)
}

function textOfBlocks(blocks: readonly (TextContent | { type: string })[]): string {
  return blocks
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n")
}

/**
 * A single in-memory chat session (one `Agent` = one conversation).
 *
 * Pure engine: owns the transcript (`systemPrompt` + every user/assistant
 * exchange) and replays the full context to the provider on each `prompt()`,
 * so a turn always sees the whole conversation. Does not persist anything,
 * touch the network, or know about processes — a host (server, CLI, TUI)
 * serializes `messages` via `messageToJson` and seeds a fresh Agent from it
 * to resume across boundaries.
 */
export class Agent {
  readonly llm: TextProvider
  private readonly systemPrompt: string
  private history: Message[]
  private listeners = new Set<AgentEventListener>()
  private abortController: AbortController | null = null
  private idlePromise: Promise<void> | null = null

  constructor(options: AgentOptions) {
    this.llm = options.llm
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
    this.history = options.history ? options.history.map((m) => messageToJson(m)) : []
  }

  /** Immutable snapshot of the session transcript (system excluded). */
  get messages(): Message[] {
    return this.history.map((m) => messageToJson(m))
  }

  /** Register an event listener. Returns an unsubscribe function. */
  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  /** Whether a prompt is currently running. */
  get isBusy(): boolean {
    return this.abortController !== null
  }

  /** Cancel any in-flight prompt. */
  abort(): void {
    this.abortController?.abort()
  }

  /** Resolves when the current prompt finishes (immediately if idle). */
  async waitForIdle(): Promise<void> {
    await this.idlePromise
  }

  /** Clear the transcript (the system prompt is retained). */
  reset(): void {
    if (this.isBusy) {
      throw new Error("Agent is busy. Wait for idle before resetting.")
    }
    this.history = []
  }

  /**
   * Send a user message and stream the assistant reply via events:
   *   message_start (assistant, empty) → message_update* → message_end
   * The exchange is appended to the transcript only on success, so a
   * throwing/aborted turn leaves the history unchanged.
   */
  async prompt(userText: string): Promise<ChatResult> {
    if (this.isBusy) {
      throw new Error("Agent is already running. Wait for idle before prompting.")
    }

    const userMessage: UserMessage = {
      role: "user",
      content: userText,
      timestamp: Date.now(),
    }

    const abortController = new AbortController()
    this.abortController = abortController
    let resolveIdle: () => void
    this.idlePromise = new Promise<void>((resolve) => {
      resolveIdle = resolve
    })

    // The transcript only commits once the turn completes.
    try {
      this.emit({ type: "message_start", message: userMessage })

      const messages = this.toProviderMessages([userText])

      let text = ""
      const assistantMessage: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "" }],
      }
      this.emit({ type: "message_start", message: assistantMessage })

      for await (const event of this.llm.stream(messages)) {
        if (abortController.signal.aborted) break
        switch (event.type) {
          case "text-delta":
            text += event.delta
            assistantMessage.content = [{ type: "text", text }]
            this.emit({ type: "message_update", message: assistantMessage })
            break
          case "error":
            throw new Error(event.message)
        }
      }

      if (!text.trim()) text = "(no response)"
      assistantMessage.content = [{ type: "text", text }]
      this.history.push(messageToJson(userMessage), messageToJson(assistantMessage))
      this.emit({ type: "message_end", message: assistantMessage })
      return { text, message: assistantMessage }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: "agent_error", error: err })
      throw err
    } finally {
      this.abortController = null
      resolveIdle!()
    }
  }

  /**
   * Translate the transcript into the provider wire format. System goes
   * first, then user/assistant turns in order. Only plain-text content is
   * sent; thinking/image/tool blocks have no provider representation yet.
   */
  private toProviderMessages(tail: string[] = []): LLMMessage[] {
    const out: LLMMessage[] = [{ role: "system", content: this.systemPrompt }]
    for (const message of this.history) {
      if (message.role === "user") {
        out.push({ role: "user", content: messageText(message) })
      } else {
        const content = messageText(message)
        if (content.trim()) out.push({ role: "assistant", content })
      }
    }
    for (const content of tail) {
      out.push({ role: "user", content })
    }
    return out
  }
}
