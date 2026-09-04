import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { MessageCircleDashedIcon, SendHorizonal, Square } from "lucide-react"
import { useChatStore } from "../store/chat"
import { useModelsStore } from "../store/models"
import type { ChatMessage } from "../../../shared/types"
import { ModelPicker } from "../components/ModelPicker"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "../components/ui/input-group"
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
import { Marker, MarkerContent, MarkerIcon } from "../components/ui/marker"
import { Spinner } from "../components/ui/spinner"

/** Minimal markdown-ish renderer for assistant replies (v1: code fences only). */
function renderMarkdown(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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
    // Clear synchronously so the re-render happens before we restore focus.
    flushSync(() => setInput(""))
    appendMessage("user")
    const msgs = useChatStore.getState().messages
    const last = msgs[msgs.length - 1]
    if (last) updateMessage(last.id, { text })
    // Carry the full transcript; the server runs one stateless turn on it.
    const transcript: ChatMessage[] = msgs.map((m) => ({ role: m.role, content: m.text }))
    void window.nyx.chat.send(transcript)
    // Keep the composer focused so the user can keep typing.
    inputRef.current?.focus()
  }

  return (
    <MessageScrollerProvider autoScroll>
      <div className="relative flex min-h-0 flex-1 flex-col p-4">
        <Card className="flex h-full min-h-0 w-full flex-col gap-0">
          <CardHeader className="gap-1 border-b">
            <CardTitle>Text generation</CardTitle>
            <CardDescription>Chat with a local model.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
            {messages.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashedIcon />
                  </EmptyMedia>
                  <EmptyTitle>{selectedModel ? "Ready when you are" : "Select a model first"}</EmptyTitle>
                  <EmptyDescription>
                    {selectedModel
                      ? "Ask anything — responses stream in from your local model."
                      : "Pick a text-generation model above the input to start chatting."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <MessageScroller className="h-full">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-4">
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
                        <Marker role="status">
                          <MarkerIcon>
                            <Spinner className="text-muted-foreground" />
                          </MarkerIcon>
                          <MarkerContent className="text-muted-foreground">Thinking…</MarkerContent>
                        </Marker>
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-2 border-t p-2">
            <div className="w-full px-1">
              <ModelPicker task="text-generation" className="h-6 border-0 px-1 text-xs text-muted-foreground shadow-none" />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
              className="w-full"
            >
              <InputGroup>
                <InputGroupTextarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Skip while an IME composition is in progress (e.g. Chinese input).
                    if (e.nativeEvent.isComposing) return
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder={selectedModel ? "Message… (Enter to send)" : "Select a model first"}
                  disabled={!selectedModel}
                  rows={5}
                  className="max-h-48"
                />
                <InputGroupAddon align="inline-end">
                  {isStreaming ? (
                    <InputGroupButton size="icon-sm" variant="secondary" onClick={() => void window.nyx.chat.abort()} aria-label="Stop generating">
                      <Square />
                    </InputGroupButton>
                  ) : (
                    <InputGroupButton
                      type="submit"
                      size="icon-sm"
                      disabled={!input.trim() || !selectedModel}
                      aria-label="Send message"
                      // Don't let the button steal focus from the composer.
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <SendHorizonal />
                    </InputGroupButton>
                  )}
                </InputGroupAddon>
              </InputGroup>
            </form>
          </CardFooter>
        </Card>
      </div>
    </MessageScrollerProvider>
  )
}
