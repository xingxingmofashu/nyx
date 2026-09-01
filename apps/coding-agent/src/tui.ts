/**
 * Chat TUI — basic interactive chat page for nyx.
 *
 * Modeled on pi's chat UI:
 *   - user messages render in a Box with background
 *   - assistant replies stream into a Markdown component
 *   - a Loader shows while the model is generating
 *   - Editor at the bottom, focusable, Ctrl+C exits
 *
 * Built on @earendil-works/pi-tui (main screen, preserves scrollback).
 */

import {
  Box,
  Container,
  Editor,
  Loader,
  Markdown,
  ProcessTerminal,
  Text,
  TuiMainScreen,
  matchesKey,
  Key,
  type TUI,
} from "@earendil-works/pi-tui";
import chalk from "chalk";
import type { Agent } from "@nyx/core";

/** Markdown theme for assistant replies. */
const mdTheme = {
  heading: (s: string) => chalk.bold.underline(s),
  link: (s: string) => chalk.blue.underline(s),
  linkUrl: (s: string) => chalk.gray(s),
  code: (s: string) => chalk.cyan(s),
  codeBlock: (s: string) => chalk.cyan(s),
  codeBlockBorder: (s: string) => chalk.gray(s),
  quote: (s: string) => chalk.gray(s),
  quoteBorder: (s: string) => chalk.gray(s),
  hr: (s: string) => chalk.gray(s),
  listBullet: (s: string) => chalk.yellow(s),
  bold: (s: string) => chalk.bold(s),
  italic: (s: string) => chalk.italic(s),
  strikethrough: (s: string) => chalk.strikethrough(s),
  underline: (s: string) => chalk.underline(s),
};

/** Editor theme. */
const editorTheme = {
  borderColor: (s: string) => chalk.gray(s),
  selectList: {
    selectedPrefix: (s: string) => chalk.green("> " + s),
    selectedText: (s: string) => chalk.bold(s),
    description: (s: string) => chalk.gray(s),
    scrollInfo: (s: string) => chalk.gray(s),
    noMatch: (s: string) => chalk.gray(s),
  },
};

export interface ChatTuiOptions {
  agent: Agent;
  model: string;
}

/** Run the interactive chat TUI. Exits via /quit or Ctrl+C. */
export async function run(options: ChatTuiOptions): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui: TUI = new TuiMainScreen(terminal);

  // --- Transcript ---
  const transcript = new Container();

  function addUserMessage(text: string): void {
    // Box with padding + background, like pi's UserMessageComponent.
    const box = new Box(1, 1, (content: string) => chalk.bgGray(content));
    box.addChild(new Markdown(text, 0, 0, mdTheme as never));
    transcript.addChild(box);
    tui.requestRender();
  }

  function addAssistantMessage(): Markdown {
    const md = new Markdown("", 1, 0, mdTheme as never);
    transcript.addChild(md);
    tui.requestRender();
    return md;
  }

  // --- Loader (spinner while the model generates) ---
  // The Loader starts animating on construction, so we only mount it while
  // a reply is generating.
  const loader = new Loader(
    tui,
    (s) => chalk.cyan(s),
    (s) => chalk.gray(s),
    "Thinking…",
  );
  loader.stop();

  // --- Editor (input) ---
  const editor = new Editor(tui, editorTheme as never);
  let isResponding = false;

  editor.onSubmit = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding) return;

    if (trimmed === "/quit" || trimmed === "/exit") {
      tui.stop();
      process.exit(0);
    }
    if (trimmed === "/clear") {
      transcript.clear();
      tui.requestRender();
      return;
    }
    if (trimmed.startsWith("/")) {
      addUserMessage(trimmed);
      const md = addAssistantMessage();
      md.setText(`Unknown command: ${trimmed}`);
      return;
    }

    // Submit: lock input, show user message + loader, stream reply.
    isResponding = true;
    editor.disableSubmit = true;
    editor.setText("");
    addUserMessage(trimmed);
    const reply = addAssistantMessage();

    loader.start();
    tui.addChild(loader);
    try {
      await options.agent.chatStream(trimmed, (delta) => {
        reply.setText(delta);
        tui.requestRender();
      });
    } catch (error) {
      reply.setText(`Error: ${(error as Error).message}`);
    } finally {
      loader.stop();
      tui.removeChild(loader);
      isResponding = false;
      editor.disableSubmit = false;
      tui.requestRender();
    }
  };

  // --- Assemble ---
  transcript.addChild(new Text(chalk.gray("Type a message. /clear resets, /quit exits.")));
  tui.addChild(transcript);
  tui.addChild(editor);
  tui.setFocus(editor);

  // Raw mode: Ctrl+C doesn't send SIGINT — intercept it.
  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      tui.stop();
      process.exit(0);
    }
  });

  tui.start();

  // Exits happen via /quit or Ctrl+C; keep the event loop alive until then.
  await new Promise<void>(() => {});
}
