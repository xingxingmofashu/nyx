import { Chat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithApprovalResponses, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai"
import { useAgentStore } from "../store/agent"
import { useApprovalsStore } from "../store/approvals"
import { useSessionsStore } from "../store/sessions"

function streamId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

class IpcChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly body: () => Record<string, unknown>) {}

  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    if (abortSignal?.aborted) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close()
        },
      })
    }
    const id = streamId()
    let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null
    let unsubscribe: (() => void) | null = null

    const abortHandler = () => {
      close()
      void window.nyx.chat.abort(id)
    }

    const close = () => {
      unsubscribe?.()
      unsubscribe = null
      abortSignal?.removeEventListener("abort", abortHandler)
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

    abortSignal?.addEventListener("abort", abortHandler)

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

export const agentChat = new Chat<UIMessage>({
  transport: new IpcChatTransport(() => {
    const agent = useAgentStore.getState()
    const approvals = useApprovalsStore.getState()
    const sessionId = useSessionsStore.getState().ensureId()
    const body = {
      workspaceDir: agent.workspaceDir || undefined,

      sessionId,

      inlineAudio: true,
      ...approvals.request(sessionId),
    }
    approvals.consume(sessionId)
    return body
  }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
})
