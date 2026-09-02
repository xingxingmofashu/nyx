import type { BrowserWindow } from "electron"
import { Agent, type AssistantMessage, type UserMessage } from "@nyx/core"
import { OnnxTextGenerationProvider } from "@nyx/llm"
import { IPC } from "../shared/ipc"
import type { ChatEvent } from "../shared/types"

/**
 * Owns the text-generation Agent used by the chat tool.
 *
 * The Agent is a one-shot event emitter (see @nyx/core loop.ts): prompt()
 * returns a ChatResult but streams progress via message_start/message_update/
 * message_end/agent_error. We forward those events to the renderer as
 * serialized ChatEvents.
 */
export class AgentService {
  private agent: Agent | null = null
  private modelId: string
  private windows = new Set<BrowserWindow>()
  private unsubscribe: (() => void) | null = null

  constructor(modelId: string) {
    this.modelId = modelId
  }

  /** Track a window so events can be broadcast to it. */
  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on("closed", () => this.windows.delete(win))
  }

  get currentModel(): string {
    return this.modelId
  }

  /** (Re)create the underlying Agent for a different model. */
  async setModel(modelId: string): Promise<void> {
    if (modelId === this.modelId && this.agent) return
    this.unsubscribe?.()
    this.agent = null
    this.modelId = modelId
  }

  /** Start a prompt; streaming events are pushed to attached windows. */
  async send(text: string): Promise<void> {
    const agent = await this.ensureAgent()
    this.broadcast({ type: "message_start", role: "assistant" })
    try {
      await agent.prompt(text)
    } catch (error) {
      // agent.prompt already emitted agent_error; nothing more to do.
    }
  }

  abort(): void {
    this.agent?.abort()
  }

  private async ensureAgent(): Promise<Agent> {
    if (!this.modelId) {
      throw new Error("No text-generation model selected. Pick a model first.")
    }
    if (!this.agent) {
      const llm = new OnnxTextGenerationProvider({ model: this.modelId })
      const agent = new Agent({ llm })
      this.unsubscribe = agent.subscribe((event) => {
        switch (event.type) {
          case "message_update": {
            const text = extractText(event.message)
            this.broadcast({ type: "message_update", text })
            break
          }
          case "message_end": {
            const text = extractText(event.message)
            this.broadcast({ type: "message_end", text })
            break
          }
          case "agent_error": {
            this.broadcast({ type: "agent_error", message: event.error.message })
            break
          }
          default:
            break
        }
      })
      this.agent = agent
    }
    return this.agent
  }

  private broadcast(event: ChatEvent): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC.chat.event, event)
    }
  }
}

function extractText(message: UserMessage | AssistantMessage): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content
    return message.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
  }
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
}
