import { useEffect, useRef, useState } from "react"
import { SendHorizonal, Square } from "lucide-react"
import { useChatStore } from "../store/chat"
import { useModelsStore } from "../store/models"
import { ModelPicker } from "../components/ModelPicker"
import { Button } from "../components/ui/button"
import { Textarea } from "../components/ui/textarea"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "../components/ui/message-scroller"
import { Message, MessageContent } from "../components/ui/message"
import { Bubble, BubbleContent } from "../components/ui/bubble"
import { Spinner } from "../components/ui/spinner"

/** Minimal markdown-ish renderer for assistant replies (v1: code fences only). */
function renderMarkdown(text: string): string {
  // Escape HTML first.
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  // Code fences → <pre>.
  return escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => `<pre>${code.trim()}</pre>`)
}

export function TextGenerationPage() {
  const { messages, appendMessage, updateMessage, setStreaming, isStreaming } = useChatStore()
  const selectedModel = useModelsStore((s) => s.selected["text-generation"])
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Subscribe to agent streaming events once.
  useEffect(() => {
    const unsubscribe = window.nyx.chat.onEvent((event) => {
      switch (event.type) {
        case "message_start": {
          setStreaming(true)
          appendMessage("assistant")
          break
        }
        case "message_update": {
          const msgs = useChatStore.getState().messages
          const last = msgs[msgs.length - 1]
          if (last && last.role === "assistant") {
            // Delta chunks accumulate onto the current assistant text.
            updateMessage(last.id, (m) => ({ text: m.text + event.text }))
          }
          break
        }
        case "message_end": {
          const msgs = useChatStore.getState().messages
          const last = msgs[msgs.length - 1]
          if (last && last.role === "assistant") updateMessage(last.id, { text: event.text, streaming: false })
          setStreaming(false)
          break
        }
        case "agent_error": {
          const msgs = useChatStore.getState().messages
          const last = msgs[msgs.length - 1]
          if (last && last.role === "assistant") {
            updateMessage(last.id, { text: event.message, streaming: false, error: true })
          }
          setStreaming(false)
          break
        }
      }
    })
    return unsubscribe
  }, [appendMessage, updateMessage, setStreaming])

  const send = () => {
    const text = input.trim()
    if (!text || isStreaming || !selectedModel) return
    setInput("")
    appendMessage("user")
    const msgs = useChatStore.getState().messages
    const last = msgs[msgs.length - 1]
    if (last) updateMessage(last.id, { text })
    void window.nyx.chat.send(text)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {messages.length === 0 && (
                <p className="mt-8 px-4 text-center text-sm text-muted-foreground">
                  {selectedModel
                    ? `Chatting with ${selectedModel}. Type a message to start.`
                    : "Select a text-generation model in the sidebar to start chatting."}
                </p>
              )}
              {messages.map((m) => (
                <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"}>
                  <Message align={m.role === "user" ? "end" : "start"}>
                    <MessageContent>
                      <Bubble
                        variant={m.role === "user" ? "default" : m.error ? "destructive" : "muted"}
                        align={m.role === "user" ? "end" : "start"}
                      >
                        <BubbleContent>
                          {m.role === "assistant" && !m.error ? (
                            <div
                              className="whitespace-pre-wrap [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-background/60 [&_pre]:p-2"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          )}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
              {isStreaming && (
                <MessageScrollerItem messageId="streaming">
                  <Message align="start">
                    <MessageContent>
                      <Bubble variant="muted" align="start">
                        <BubbleContent>
                          <Spinner data-icon="inline-start" className="text-muted-foreground" />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="flex items-end gap-2 border-t bg-card px-4 py-3">
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg border bg-background px-2 py-2 focus-within:border-ring">
          <div className="flex items-center justify-between gap-2 px-1">
            <ModelPicker task="text-generation" className="h-6 border-0 px-1 text-xs text-muted-foreground shadow-none" />
          </div>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={selectedModel ? "Message… (Enter to send)" : "Select a model first"}
            disabled={!selectedModel || isStreaming}
            className="min-h-9 max-h-40 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
            rows={1}
          />
        </div>
        {isStreaming ? (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void window.nyx.chat.abort()}
            aria-label="Stop generating"
          >
            <Square data-icon="inline-start" />
          </Button>
        ) : (
          <Button size="icon" onClick={send} disabled={!input.trim() || !selectedModel} aria-label="Send message">
            <SendHorizonal data-icon="inline-start" />
          </Button>
        )}
      </div>
    </div>
  )
}
