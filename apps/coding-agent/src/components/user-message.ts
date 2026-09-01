import { Box, Container, Markdown } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme";

export class UserMessageComponent extends Container {
  constructor(text: string) {
    super();
    const box = new Box(1, 1, (s: string) => theme.bg("userMessageBg", s));
    box.addChild(new Markdown(text, 0, 0, getMarkdownTheme()));
    this.addChild(box);
  }
}
