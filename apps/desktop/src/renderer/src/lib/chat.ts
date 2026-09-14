import { Chat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithApprovalResponses, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai"
import type { ChatEndpoint } from "../../../shared/types"
import { useAgentStore } from "../store/agent"
import { useModelsStore } from "../store/models"

/** Unique-ish id without relying on a secure-context `crypto.randomUUID`. */
function streamId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Bridges the AI SDK's `ChatTransport` to Electron IPC: the renderer never
 * talks HTTP directly, `main` streams the server's UI message chunks back.
 */
class IpcChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly endpoint: ChatEndpoint,
    private readonly body: () => Record<string, unknown>,
  ) {}

  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const id = streamId()
    let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null
    let unsubscribe: (() => void) | null = null

    const close = () => {
      unsubscribe?.()
      unsubscribe = null
    }

    const stream = new ReadableStream<UIMessageChunk>({
      start(c) {
        controller = c
      },
      cancel() {
        close()
        void window.nyx.chat.abort(id)
      },
    })

    unsubscribe = window.nyx.chat.onEvent((event) => {
      if (event.streamId !== id) return
      if (event.type === "chunk") {
        controller?.enqueue(event.chunk)
      } else {
        close()
        if (event.type === "error") controller?.error(new Error(event.message))
        else controller?.close()
      }
    })

    abortSignal?.addEventListener("abort", () => {
      close()
      void window.nyx.chat.abort(id)
    })

    void window.nyx.chat
      .send({ streamId: id, endpoint: this.endpoint, body: { messages, ...this.body() } })
      .catch((error: unknown) => {
        close()
        controller?.error(error instanceof Error ? error : new Error(String(error)))
      })

    return stream
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}

/**
 * One long-lived `Chat` per endpoint, created at module scope so the
 * conversation survives route changes. Approvals auto-resubmit once the whole
 * assistant message is answered.
 */
export const agentChat = new Chat<UIMessage>({
  transport: new IpcChatTransport("agent", () => ({
    workspaceDir: useAgentStore.getState().workspaceDir || undefined,
  })),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
})

export const textGenerationChat = new Chat<UIMessage>({
  transport: new IpcChatTransport("text-generation", () => ({
    model: useModelsStore.getState().selected["text-generation"],
  })),
})
