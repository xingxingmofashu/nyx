import { useEffect, useRef, useState } from "react"
import { SendHorizonal, Square } from "lucide-react"
import { useChatStore } from "../store/chat"
import { useModelsStore } from "../store/models"

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
  const inputRef = useRef<HTMLInputElement>(null)

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
          if (last && last.role === "assistant") updateMessage(last.id, { text: event.text })
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
          <p className="mt-8 text-center text-sm text-zinc-500">
            {selectedModel
              ? `Chatting with ${selectedModel}. Type a message to start.`
              : "Select a text-generation model in the sidebar to start chatting."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-emerald-700 text-white"
                  : m.error
                    ? "bg-red-900/60 text-red-100"
                    : "bg-zinc-800 text-zinc-100"
              }`}
              dangerouslySetInnerHTML={{ __html: m.role === "assistant" && !m.error ? renderMarkdown(m.text) : m.text }}
            />
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <span className="flex gap-1 rounded-lg bg-zinc-800 px-3 py-2">
              <Dot /> <Dot /> <Dot />
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={selectedModel ? "Message…" : "Select a model first"}
          disabled={!selectedModel || isStreaming}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        />
        {isStreaming ? (
          <button
            onClick={() => void window.nyx.chat.abort()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-700 text-white hover:bg-zinc-600"
            aria-label="Stop generating"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!input.trim() || !selectedModel}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            aria-label="Send message"
          >
            <SendHorizonal size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

function Dot() {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
}
