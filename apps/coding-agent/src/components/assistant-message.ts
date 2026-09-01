import { Container, Markdown, Spacer } from "@earendil-works/pi-tui";
import { defaultMarkdownTheme } from "../theme";

export class AssistantMessageComponent extends Container {
  private contentContainer: Container;
  private markdown: Markdown | null = null;
  private lastText = "";

  constructor(text = "") {
    super();
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);
    this.updateContent(text);
  }

  updateContent(text: string): void {
    this.lastText = text;
    this.contentContainer.clear();

    const trimmed = text.trim();
    if (trimmed) {
      this.contentContainer.addChild(new Spacer(1));
      this.markdown = new Markdown(trimmed, 1, 0, defaultMarkdownTheme);
      this.contentContainer.addChild(this.markdown);
      this.contentContainer.addChild(new Spacer(1));
    }
  }

  setText(text: string): void {
    this.updateContent(text);
  }

  override invalidate(): void {
    super.invalidate();
    this.updateContent(this.lastText);
  }
}
