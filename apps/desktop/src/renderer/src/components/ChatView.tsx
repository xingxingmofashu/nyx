import { useEffect, useRef, useState } from "react"
import { SendHorizonal, Square } from "lucide-react"
import { useChatStore } from "../store/chat"
import { useModelsStore } from "../store/models"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { cn } from "../lib/utils"

/** Minimal markdown-ish renderer for assistant replies (v1: code fences only). */
function renderMarkdown(text: string): string {
  // Escape HTML first.
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  // Code fences → <pre>.
  return escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => `<pre>${code.trim()}</pre>`)
}

export function ChatView() {
  const { messages, appendMessage, updateMessage, setStreaming, isStreaming } = useChatStore()
  const selectedModel = useModelsStore((s) => s.selected["text-generation"])
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
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

  // Keep the transcript scrolled to the bottom.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

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
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {selectedModel
              ? `Chatting with ${selectedModel}. Type a message to start.`
              : "Select a text-generation model in the sidebar to start chatting."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : m.error
                    ? "bg-destructive/10 text-destructive"
                    : "bg-card text-card-foreground border",
              )}
              dangerouslySetInnerHTML={{ __html: m.role === "assistant" && !m.error ? renderMarkdown(m.text) : m.text }}
            />
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <span className="flex gap-1 rounded-lg border bg-card px-3 py-2">
              <Dot /> <Dot /> <Dot />
            </span>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t bg-card px-4 py-3">
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
          className="min-h-9 max-h-40 flex-1 resize-none"
          rows={1}
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void window.nyx.chat.abort()}
            aria-label="Stop generating"
          >
            <Square />
          </Button>
        ) : (
          <Button size="icon" onClick={send} disabled={!input.trim() || !selectedModel} aria-label="Send message">
            <SendHorizonal />
          </Button>
        )}
      </div>
    </div>
  )
}

function Dot() {
  return <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
}
