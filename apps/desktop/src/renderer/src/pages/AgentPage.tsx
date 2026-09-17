import { useEffect, useRef, useState } from "react"
import { Bot, FolderOpen, Minimize2, RotateCcw, Settings2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useChat } from "@ai-sdk/react"
import { getToolName, isReasoningUIPart, isToolUIPart } from "ai"
import { newId } from "@nyx/shared"
import { agentChat } from "../lib/chat"
import { baseName } from "../lib/format"
import { useAgentStore } from "../store/agent"
import { useModelsStore } from "../store/models"
import { useSessionsStore } from "../store/sessions"
import type { ChatMessageMetadata, SavedAttachment } from "../../../shared/types"
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
import { ChatComposer, type PendingAttachment } from "../components/chat/ChatComposer"
import { AttachmentStrip } from "../components/chat/AttachmentStrip"
import { VoiceInputButton } from "../components/chat/VoiceInputButton"
import { MarkdownText } from "../components/chat/MarkdownText"
import { StreamingMarker } from "../components/chat/StreamingMarker"
import { ToolCallCard, type ToolPartState } from "../components/agent/ToolCallCard"
import { SpeechCard } from "../components/agent/SpeechCard"
import { ImageCard } from "../components/agent/ImageCard"
import { ApprovalCard } from "../components/agent/ApprovalCard"
import { CompactionCard, FoldedMessages } from "../components/agent/CompactionCard"
import { ContextMeter } from "../components/chat/ContextMeter"
import { Spinner } from "../components/ui/spinner"

/** How many images one message may carry (keeps the composer tidy). */
const MAX_ATTACHMENTS = 5

export function AgentPage() {
  const { messages, sendMessage, status, stop, error, clearError, addToolApprovalResponse } =
    useChat({ chat: agentChat })
  const brainLabel = useAgentStore((s) => s.brainLabel)
  const configured = useAgentStore((s) => s.configured)
  const workspaceDir = useAgentStore((s) => s.workspaceDir)
  const contextLimit = useAgentStore((s) => s.contextLimit)
  const init = useAgentStore((s) => s.init)
  const setWorkspace = useAgentStore((s) => s.setWorkspace)
  const voiceModel = useModelsStore((s) => s.selected["automatic-speech-recognition"])
  const activeId = useSessionsStore((s) => s.activeId)
  const sessions = useSessionsStore((s) => s.sessions)
  const createSession = useSessionsStore((s) => s.create)
  const compact = useSessionsStore((s) => s.compact)
  const compacting = useSessionsStore((s) => s.compacting)
  const compactNotice = useSessionsStore((s) => s.compactNotice)
  const contextOverride = useSessionsStore((s) => s.contextOverride)
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const restored = useRef(false)
  const navigate = useNavigate()

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

  /** Input tokens + resolved window from the most recent turn (provider-reported). */
  const usage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i]?.metadata as ChatMessageMetadata | undefined
      if (meta?.usage?.inputTokens) return meta
    }
    return undefined
  })()
  const contextUsed = usage?.usage?.inputTokens ?? 0
  const contextWindow = usage?.contextLimit ?? contextLimit
  // Right after a manual compaction the last turn's usage is stale, so show the
  // server's estimate until the next turn reports real numbers.
  const estimated =
    contextOverride && contextOverride.forId === messages[messages.length - 1]?.id ? contextOverride.tokens : undefined

  /**
   * The newest checkpoint folds every message it covers into its card: those
   * messages are summarized away for the model, so the UI shows the same thing.
   * Later messages stay verbatim below the card (which sits on the assistant
   * reply that produced the checkpoint).
   */
  const folded = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const checkpoint = (messages[i]?.metadata as ChatMessageMetadata | undefined)?.compaction
      if (!checkpoint) continue
      const end = messages.findIndex((message) => message.id === checkpoint.coveredThroughId)
      if (end < 0 || end >= i) continue
      return { index: i, end, checkpoint }
    }
    return undefined
  })()

  /** Keep object URLs alive until send/remove so unmount never leaks them. */
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  useEffect(() => {
    return () => {
      for (const file of attachmentsRef.current) URL.revokeObjectURL(file.url)
    }
  }, [])

  const addAttachments = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"))
    if (images.length === 0) return
    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setAttachError(`At most ${MAX_ATTACHMENTS} images per message`)
      return
    }
    setAttachError(images.length > room ? `At most ${MAX_ATTACHMENTS} images per message` : null)
    setAttachments((prev) => [
      ...prev,
      ...images.slice(0, Math.max(0, MAX_ATTACHMENTS - prev.length)).map((file) => ({
        id: newId(),
        name: file.name || "image",
        url: URL.createObjectURL(file),
        file,
      })),
    ])
  }

  const removeAttachment = (id: string) => {
    const removed = attachments.find((file) => file.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    setAttachments((prev) => prev.filter((file) => file.id !== id))
    setAttachError(null)
  }

  const submit = () => {
    const text = input.trim()
    if (busy || uploading || (!text && attachments.length === 0)) return
    const pending = attachments
    setAttachError(null)

    void (async () => {
      // Copy attachments into the workspace first: the agent's tools read files
      // by workspace-relative path, and the brain only needs that path.
      let saved: SavedAttachment[] = []
      if (pending.length > 0) {
        setUploading(true)
        try {
          saved = await Promise.all(
            pending.map(async (file) => {
              const data = new Uint8Array(await file.file.arrayBuffer())
              return window.nyx.files.saveAttachment({
                workspaceDir: useAgentStore.getState().workspaceDir,
                sessionId: useSessionsStore.getState().ensureId(),
                data,
                name: file.name,
                mimeType: file.file.type || "image/png",
              })
            }),
          )
        } catch (error) {
          setAttachError(error instanceof Error ? error.message : String(error))
          return
        } finally {
          setUploading(false)
        }
      }

      setInput("")
      setAttachments([])
      for (const file of pending) URL.revokeObjectURL(file.url)
      const metadata: ChatMessageMetadata = saved.length > 0 ? { attachments: saved } : {}
      await sendMessage({ text, metadata })
    })()
  }

  const pickWorkspace = async () => {
    if (busy) return
    const dir = await window.nyx.dialog.selectDirectory()
    if (!dir) return
    // Sessions are per workspace: switch, reload the sidebar for the new one,
    // and start a fresh chat.
    await setWorkspace(dir)
    await useSessionsStore.getState().load()
    createSession()
  }

  const reset = () => {
    void createSession()
    clearError()
  }

  const placeholder = !configured
    ? "Configure the master brain in Settings"
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
              <ContextMeter
                used={estimated ?? contextUsed}
                limit={contextWindow}
                estimated={estimated !== undefined}
                className="me-1"
              />
              <Button
                variant={compacting ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => void compact()}
                aria-label="Compact context"
                title="Summarize the earlier conversation now to free up context"
                disabled={busy || compacting || messages.length === 0}
              >
                {compacting ? <Spinner /> : <Minimize2 />}
              </Button>
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
                    : "Set the model and provider on the Settings page, then send a message."}
                </EmptyDescription>
                {!configured && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/settings")}>
                    <Settings2 data-icon="inline-start" />
                    Open settings
                  </Button>
                )}
                </EmptyHeader>
              </Empty>
            ) : (
              <MessageScroller className="h-full">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-4">
                    {messages.map((message, messageIndex) => {
                      // Covered by the newest checkpoint: rendered inside its card.
                      if (folded && messageIndex <= folded.end) return null
                      const animating =
                        status === "streaming" &&
                        messageIndex === messages.length - 1 &&
                        message.role === "assistant"
                      const meta = message.metadata as ChatMessageMetadata | undefined
                      const userAttachments =
                        message.role === "user" ? (meta?.attachments ?? []) : []
                      return (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor={message.role === "user"}
                        >
                          <Message align={message.role === "user" ? "end" : "start"}>
                            <MessageContent>
                              {meta?.compaction && (
                                <CompactionCard checkpoint={meta.compaction}>
                                  {folded ? (
                                    <FoldedMessages messages={messages.slice(0, folded.end + 1)} />
                                  ) : undefined}
                                </CompactionCard>
                              )}
                              {userAttachments.length > 0 && (
                                <AttachmentStrip attachments={userAttachments} />
                              )}
                              {message.parts.map((part, index) => {
                                if (part.type === "text") {
                                  return (
                                    <Bubble
                                      key={index}
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
                                  )
                                }
                                if (isReasoningUIPart(part)) {
                                  return (
                                    <Bubble key={index} variant="ghost" align="start">
                                      <BubbleContent>
                                        <MarkdownText
                                          text={part.text}
                                          className="text-xs text-muted-foreground"
                                        />
                                      </BubbleContent>
                                    </Bubble>
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

                                if (name === "local_image_to_image") {
                                  return (
                                    <ImageCard
                                      key={part.toolCallId}
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
                            </MessageContent>
                          </Message>
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
          {compacting ? (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">Summarizing the earlier context…</p>
          ) : null}
          {!compacting && compactNotice && !busy && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">{compactNotice}</p>
          )}
          {(error || attachError) && (
            <p className="border-t px-4 py-2 text-xs text-destructive">
              {attachError ?? error?.message}
            </p>
          )}
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={submit}
            onAbort={() => stop()}
            streaming={busy}
            disabled={!configured || busy || uploading}
            placeholder={placeholder}
            attachments={attachments}
            onAttach={workspaceDir ? addAttachments : undefined}
            onRemoveAttachment={removeAttachment}
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
