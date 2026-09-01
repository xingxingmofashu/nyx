import { Box, Container, Markdown } from "@earendil-works/pi-tui";
import { defaultMarkdownTheme, userMessageBg } from "../theme";

export class UserMessageComponent extends Container {
  constructor(text: string) {
    super();
    const box = new Box(1, 1, userMessageBg);
    box.addChild(new Markdown(text, 0, 0, defaultMarkdownTheme));
    this.addChild(box);
  }
}
