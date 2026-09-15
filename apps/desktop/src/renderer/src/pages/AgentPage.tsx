import { useEffect, useRef, useState } from "react"
import { Bot, FolderOpen, RotateCcw } from "lucide-react"
import { useChat } from "@ai-sdk/react"
import { getToolName, isReasoningUIPart, isToolUIPart } from "ai"
import { agentChat } from "../lib/chat"
import { baseName } from "../lib/format"
import { useAgentStore } from "../store/agent"
import { useModelsStore } from "../store/models"
import { useSessionsStore } from "../store/sessions"
import { Button } from "../components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "../components/ui/message-scroller"
import { Message, MessageContent } from "../components/ui/message"
import { Bubble, BubbleContent } from "../components/ui/bubble"
import { ChatComposer } from "../components/chat/ChatComposer"
import { VoiceInputButton } from "../components/chat/VoiceInputButton"
import { MarkdownText } from "../components/chat/MarkdownText"
import { StreamingMarker } from "../components/chat/StreamingMarker"
import { ToolCallCard, type ToolPartState } from "../components/agent/ToolCallCard"
import { SpeechCard } from "../components/agent/SpeechCard"
import { ApprovalCard } from "../components/agent/ApprovalCard"

export function AgentPage() {
  const { messages, sendMessage, status, stop, error, clearError, addToolApprovalResponse } =
    useChat({ chat: agentChat })
  const brainLabel = useAgentStore((s) => s.brainLabel)
  const configured = useAgentStore((s) => s.configured)
  const workspaceDir = useAgentStore((s) => s.workspaceDir)
  const init = useAgentStore((s) => s.init)
  const setWorkspace = useAgentStore((s) => s.setWorkspace)
  const voiceModel = useModelsStore((s) => s.selected["automatic-speech-recognition"])
  const activeId = useSessionsStore((s) => s.activeId)
  const sessions = useSessionsStore((s) => s.sessions)
  const createSession = useSessionsStore((s) => s.create)
  const [input, setInput] = useState("")
  const restored = useRef(false)

  useEffect(() => {
    // Restore the last opened session of the current workspace once (StrictMode-safe).
    if (restored.current) return
    restored.current = true
    void (async () => {
      await init()
      const store = useSessionsStore.getState()
      await store.load()
      await store.restoreLast(useAgentStore.getState().workspaceDir)
    })()
  }, [init])

  const title = (activeId ? sessions.find((s) => s.id === activeId)?.title : undefined) ?? "New chat"

  const busy = status === "submitted" || status === "streaming"

  const submit = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput("")
    void sendMessage({ text })
  }

  const pickWorkspace = async () => {
    if (busy) return
    const dir = await window.nyx.dialog.selectDirectory()
    if (!dir) return
    // Sessions are per workspace, so start a fresh chat in the new one.
    await setWorkspace(dir)
    createSession()
  }

  const reset = () => {
    void createSession()
    clearError()
  }

  const placeholder = !configured
    ? "Configure the master brain in ~/.nyx/settings.json"
    : busy
      ? "Working…"
      : "Message the agent… (Enter to send)"

  return (
    <MessageScrollerProvider autoScroll>
      <div className="relative flex min-h-0 flex-1 flex-col p-4">
        <Card className="flex h-full min-h-0 w-full flex-col gap-0">
          <CardHeader className="gap-1 border-b">
            <CardTitle className="truncate">{title}</CardTitle>
            <CardDescription>
              {configured ? brainLabel : "No master brain configured"}
            </CardDescription>
            <CardAction className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void pickWorkspace()} disabled={busy}>
                <FolderOpen data-icon="inline-start" />
                {workspaceDir ? baseName(workspaceDir) : "Choose workspace"}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={reset}
                aria-label="New session"
                disabled={messages.length === 0}
              >
                <RotateCcw />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
            {messages.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Bot />
                  </EmptyMedia>
                  <EmptyTitle>{configured ? "Ready when you are" : "No master brain configured"}</EmptyTitle>
                  <EmptyDescription>
                    {configured
                      ? "Ask the agent to read or edit files, run commands, or use local models in the workspace."
                      : "Set agent.model and agent.provider in ~/.nyx/settings.json, then restart Nyx."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <MessageScroller className="h-full">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-4">
                    {messages.map((message, messageIndex) => {
                      const animating =
                        status === "streaming" &&
                        messageIndex === messages.length - 1 &&
                        message.role === "assistant"
                      return (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor={message.role === "user"}
                        >
                          {message.parts.map((part, index) => {
                            if (part.type === "text") {
                              return (
                                <Message key={index} align={message.role === "user" ? "end" : "start"}>
                                  <MessageContent>
                                    <Bubble
                                      variant={message.role === "user" ? "default" : "muted"}
                                      align={message.role === "user" ? "end" : "start"}
                                    >
                                      <BubbleContent>
                                        {message.role === "user" ? (
                                          <p className="whitespace-pre-wrap">{part.text}</p>
                                        ) : (
                                          <MarkdownText
                                            text={part.text}
                                            isAnimating={animating && index === message.parts.length - 1}
                                          />
                                        )}
                                      </BubbleContent>
                                    </Bubble>
                                  </MessageContent>
                                </Message>
                              )
                            }
                            if (isReasoningUIPart(part)) {
                              return (
                                <Message key={index} align="start">
                                  <MessageContent>
                                    <Bubble variant="ghost" align="start">
                                      <BubbleContent>
                                        <MarkdownText
                                          text={part.text}
                                          className="text-xs text-muted-foreground"
                                        />
                                      </BubbleContent>
                                    </Bubble>
                                  </MessageContent>
                                </Message>
                              )
                            }
                            if (!isToolUIPart(part)) return null

                            const name = getToolName(part)
                            if (part.state === "approval-requested") {
                              return (
                                <ApprovalCard
                                  key={part.toolCallId}
                                  name={name}
                                  input={part.input}
                                  onApprove={() =>
                                    addToolApprovalResponse({ id: part.approval.id, approved: true })
                                  }
                                  onDeny={() =>
                                    addToolApprovalResponse({
                                      id: part.approval.id,
                                      approved: false,
                                      reason: "user denied",
                                    })
                                  }
                                />
                              )
                            }

                            if (name === "local_text_to_speech") {
                              return (
                                <SpeechCard
                                  key={part.toolCallId}
                                  toolCallId={part.toolCallId}
                                  name={name}
                                  state={part.state as ToolPartState}
                                  output={part.state === "output-available" ? part.output : undefined}
                                  errorText={part.state === "output-error" ? part.errorText : undefined}
                                />
                              )
                            }

                            return (
                              <ToolCallCard
                                key={part.toolCallId}
                                name={name}
                                input={part.input}
                                state={part.state as ToolPartState}
                                output={part.state === "output-available" ? part.output : undefined}
                                errorText={part.state === "output-error" ? part.errorText : undefined}
                              />
                            )
                          })}
                        </MessageScrollerItem>
                      )
                    })}
                    {status === "submitted" && (
                      <MessageScrollerItem messageId="streaming">
                        <StreamingMarker />
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
          </CardContent>
          {error && (
            <p className="border-t px-4 py-2 text-xs text-destructive">{error.message}</p>
          )}
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={submit}
            onAbort={() => stop()}
            streaming={busy}
            disabled={!configured || busy}
            placeholder={placeholder}
            trailing={
              <VoiceInputButton
                model={voiceModel}
                disabled={!configured || busy}
                onTranscribed={(text) => void sendMessage({ text })}
              />
            }
          />
        </Card>
      </div>
    </MessageScrollerProvider>
  )
}
