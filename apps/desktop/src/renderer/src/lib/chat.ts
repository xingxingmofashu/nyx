import { Chat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithApprovalResponses, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai"
import { useAgentStore } from "../store/agent"
import { useSessionsStore } from "../store/sessions"

/** Unique-ish id without relying on a secure-context `crypto.randomUUID`. */
function streamId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Bridges the AI SDK's `ChatTransport` to Electron IPC: the renderer never
 * talks HTTP directly, `main` streams the agent's UI message chunks back.
 */
class IpcChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly body: () => Record<string, unknown>) {}

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
      .send({ streamId: id, body: { messages, ...this.body() } })
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
 * One long-lived `Chat`, created at module scope so the conversation survives
 * route changes. Approvals auto-resubmit once the whole assistant message is
 * answered.
 */
export const agentChat = new Chat<UIMessage>({
  transport: new IpcChatTransport(() => ({
    workspaceDir: useAgentStore.getState().workspaceDir || undefined,
    // Names generated speech clips so a deleted session takes its audio with it.
    sessionId: useSessionsStore.getState().ensureId(),
    // The desktop can render audio inline, so speech tools return it instead of
    // playing it on the server machine.
    inlineAudio: true,
  })),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
})
