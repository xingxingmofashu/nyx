import {
  Container,
  Markdown,
  Spacer,
  type MarkdownTheme,
} from "@earendil-works/pi-tui"
import { getMarkdownTheme } from "../theme"

export class AssistantMessageComponent extends Container {
  private contentContainer: Container
  private markdownTheme: MarkdownTheme
  private lastText: string
  private outputPad: number

  constructor(
    text = "",
    markdownTheme: MarkdownTheme = getMarkdownTheme(),
    outputPad = 1,
  ) {
    super()
    this.markdownTheme = markdownTheme
    this.outputPad = outputPad
    this.lastText = text

    this.contentContainer = new Container()
    this.addChild(this.contentContainer)

    if (text.trim()) {
      this.updateText(text)
    }
  }

  updateText(text: string): void {
    this.lastText = text
    this.contentContainer.clear()

    if (!text.trim()) return

    this.contentContainer.addChild(new Spacer(1))
    this.contentContainer.addChild(new Markdown(text.trim(), this.outputPad, 0, this.markdownTheme, undefined, {}))
  }

  override invalidate(): void {
    super.invalidate()
    if (this.lastText.trim()) {
      this.updateText(this.lastText)
    }
  }
}
