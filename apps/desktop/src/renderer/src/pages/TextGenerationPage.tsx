import { useEffect, useState } from "react"
import { MessageCircleDashedIcon } from "lucide-react"
import { useChat } from "@ai-sdk/react"
import { useModelsStore } from "../store/models"
import { textGenerationChat } from "../lib/chat"
import { ModelPicker } from "../components/ModelPicker"
import {
  Card,
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
import { MarkdownText } from "../components/chat/MarkdownText"
import { StreamingMarker } from "../components/chat/StreamingMarker"

export function TextGenerationPage() {
  const { messages, sendMessage, status, stop, error } = useChat({ chat: textGenerationChat })
  const selectedModel = useModelsStore((s) => s.selected["text-generation"])
  const [input, setInput] = useState("")

  useEffect(() => {
    void useModelsStore.getState().load()
  }, [])

  const busy = status === "submitted" || status === "streaming"

  const submit = () => {
    const text = input.trim()
    if (!text || busy || !selectedModel) return
    setInput("")
    void sendMessage({ text })
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
                          {message.parts.map((part, index) =>
                            part.type === "text" ? (
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
                            ) : null,
                          )}
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
          {error && <p className="border-t px-4 py-2 text-xs text-destructive">{error.message}</p>}
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={submit}
            onAbort={() => stop()}
            streaming={busy}
            disabled={!selectedModel || busy}
            placeholder={selectedModel ? "Message… (Enter to send)" : "Select a model first"}
            header={
              <ModelPicker
                task="text-generation"
                className="h-6 border-0 px-1 text-xs text-muted-foreground shadow-none"
              />
            }
          />
        </Card>
      </div>
    </MessageScrollerProvider>
  )
}
