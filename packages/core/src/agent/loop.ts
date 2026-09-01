import type { LLMProvider } from "@nyx/llm"
import type { AssistantMessage, UserMessage } from "../types"

export type AgentEvent =
  | { type: "message_start"; message: UserMessage | AssistantMessage }
  | { type: "message_update"; message: AssistantMessage }
  | { type: "message_end"; message: AssistantMessage }
  | { type: "agent_error"; error: Error }

export type AgentEventListener = (event: AgentEvent) => void

export interface ChatResult {
  /** The model's reply text. */
  text: string
}

export class Agent {
  private llm: LLMProvider
  private systemPrompt: string
  private listeners = new Set<AgentEventListener>()
  private abortController: AbortController | null = null
  private idlePromise: Promise<void> | null = null

  constructor(options: { llm: LLMProvider; systemPrompt?: string }) {
    this.llm = options.llm
    this.systemPrompt =
      options.systemPrompt ??
      "You are nyx, a helpful local assistant. Answer concisely."
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

  /**
   * Send a user message and stream the assistant reply via events:
   *   message_start (assistant, empty) → message_update* (deltas) → message_end
   */
  async prompt(userText: string): Promise<ChatResult> {
    if (this.isBusy) {
      throw new Error(
        "Agent is already running. Wait for idle before prompting.",
      )
    }

    const abortController = new AbortController()
    this.abortController = abortController
    let resolveIdle: () => void
    this.idlePromise = new Promise<void>((resolve) => {
      resolveIdle = resolve
    })

    const userMessage: UserMessage = {
      role: "user",
      content: userText,
      timestamp: Date.now(),
    }
    this.emit({ type: "message_start", message: userMessage })

    const messages = [
      { role: "system" as const, content: this.systemPrompt },
      { role: "user" as const, content: userText },
    ]

    let text = ""
    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "" }],
    }
    this.emit({ type: "message_start", message: assistantMessage })

    try {
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
      this.emit({ type: "message_end", message: assistantMessage })
      return { text }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: "agent_error", error: err })
      throw err
    } finally {
      this.abortController = null
      resolveIdle!()
    }
  }
}
