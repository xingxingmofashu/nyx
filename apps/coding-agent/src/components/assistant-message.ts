import {
  Container,
  Markdown,
  Spacer,
  Text,
  type MarkdownTheme,
} from "@earendil-works/pi-tui"
import { getMarkdownTheme, theme } from "../theme"
import type { AssistantMessage } from "@nyx/core"

export class AssistantMessageComponent extends Container {
  private contentContainer: Container
  private markdownTheme: MarkdownTheme
  private hiddenThinkingLabel: string
  private lastMessage?: AssistantMessage
  private outputPad: number

  constructor(
    message?: AssistantMessage,
    markdownTheme: MarkdownTheme = getMarkdownTheme(),
    hiddenThinkingLabel = "Thinking...",
    outputPad = 1,
  ) {
    super()
    this.markdownTheme = markdownTheme
    this.hiddenThinkingLabel = hiddenThinkingLabel
    this.outputPad = outputPad

    this.contentContainer = new Container()
    this.addChild(this.contentContainer)

    if (message) {
      this.updateContent(message)
    }
  }

  updateContent(message: AssistantMessage): void {
    this.lastMessage = message
    this.contentContainer.clear()

    const hasVisibleContent = message.content.some(
      (c) =>
        (c.type === "text" && c.text.trim()) ||
        (c.type === "thinking" && c.thinking.trim()),
    )

    if (hasVisibleContent) {
      this.contentContainer.addChild(new Spacer(1))
    }

    // Render content in order
    for (let i = 0; i < message.content.length; i++) {
      const content = message.content[i]!

      if (content.type === "text" && content.text.trim()) {
        // Assistant text messages with no background - trim the text
        // Set paddingY=0 to avoid extra spacing before tool executions
        this.contentContainer.addChild(
          new Markdown(
            content.text.trim(),
            this.outputPad,
            0,
            this.markdownTheme,
            undefined,
            {},
          ),
        )
      } else if (content.type === "thinking") {
        const thinkingBlocks: string[] = []
        for (; i < message.content.length; i++) {
          const thinkingContent = message.content[i]!
          if (thinkingContent.type !== "thinking") {
            break
          }
          const thinking = thinkingContent.thinking.trim()
          if (thinking) {
            thinkingBlocks.push(thinking)
          }
        }
        i--

        if (thinkingBlocks.length === 0) {
          continue
        }

        // Add spacing only when another visible assistant content block follows.
        // This avoids a superfluous blank line before separately-rendered tool execution blocks.
        const hasVisibleContentAfter = message.content
          .slice(i + 1)
          .some(
            (c) =>
              (c.type === "text" && c.text.trim()) ||
              (c.type === "thinking" && c.thinking.trim()),
          )

        // Render each run of thinking blocks as one Markdown section.
        this.contentContainer.addChild(
          new Markdown(
            thinkingBlocks.join("\n\n"),
            this.outputPad,
            0,
            this.markdownTheme,
            {
              color: (text: string) => theme.fg("thinkingText", text),
              italic: true,
            },
            {},
          ),
        )

        if (hasVisibleContentAfter) {
          this.contentContainer.addChild(new Spacer(1))
        }
      }
    }
  }

  override invalidate(): void {
    super.invalidate()
    if (this.lastMessage) {
      this.updateContent(this.lastMessage)
    }
  }
}
