import {
  Container,
  Editor,
  ProcessTerminal,
  Text,
  TuiMainScreen,
  matchesKey,
  Key,
  type TUI,
} from "@earendil-works/pi-tui";
import type { Agent, AssistantMessage, UserMessage } from "@nyx/core";
import { UserMessageComponent } from "./components/user-message";
import { AssistantMessageComponent } from "./components/assistant-message";
import { WorkingStatusIndicator } from "./components/status-indicator";
import { getEditorTheme, theme } from "./theme";

export interface TuiOptions {
  agent: Agent;
  model: string;
}

function getMessageText(message: UserMessage | AssistantMessage): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export async function run(options: TuiOptions): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui: TUI = new TuiMainScreen(terminal);
  const chatContainer = new Container();
  const statusContainer = new Container();

  let streamingReply: AssistantMessageComponent | null = null;
  let workingIndicator: WorkingStatusIndicator | null = null;

  function addMessageToChat(message: UserMessage | AssistantMessage): void {
    if (message.role === "user") {
      chatContainer.addChild(new UserMessageComponent(getMessageText(message)));
    } else if (message.role === "assistant") {
      streamingReply = new AssistantMessageComponent(message);
      chatContainer.addChild(streamingReply);
    }
    tui.requestRender();
  }

  function showWorkingIndicator(): void {
    if (workingIndicator) return;
    workingIndicator = new WorkingStatusIndicator(tui);
    statusContainer.addChild(workingIndicator);
    tui.requestRender();
  }

  function clearWorkingIndicator(): void {
    if (!workingIndicator) return;
    workingIndicator.dispose();
    workingIndicator = null;
    statusContainer.clear();
    tui.requestRender();
  }

  const editor = new Editor(tui, getEditorTheme() as never);
  let isResponding = false;

  editor.onSubmit = (text) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding) return;

    if (trimmed === "/quit" || trimmed === "/exit") {
      tui.stop();
      process.exit(0);
    }
    if (trimmed === "/clear") {
      chatContainer.clear();
      tui.requestRender();
      return;
    }
    if (trimmed.startsWith("/")) {
      addMessageToChat({ role: "user", content: trimmed, timestamp: Date.now() });
      addMessageToChat({ role: "assistant", content: [{ type: "text", text: `Unknown command: ${trimmed}` }] });
      return;
    }

    isResponding = true;
    editor.disableSubmit = true;
    editor.setText("");
    addMessageToChat({ role: "user", content: trimmed, timestamp: Date.now() });
    showWorkingIndicator();
    void options.agent.prompt(trimmed);
  };

  options.agent.subscribe((event) => {
    switch (event.type) {
      case "message_start":
        if (event.message.role === "assistant") {
          addMessageToChat(event.message);
        }
        break;
      case "message_update":
        if (event.message.role === "assistant" && streamingReply) {
          streamingReply.updateContent(event.message);
          clearWorkingIndicator();
          tui.requestRender();
        }
        break;
      case "message_end":
      case "agent_error": {
        if (streamingReply) {
          const text =
            event.type === "agent_error" ? `Error: ${event.error.message}` : getMessageText(event.message);
          streamingReply.updateContent({ role: "assistant", content: [{ type: "text", text }] });
        }
        streamingReply = null;
        clearWorkingIndicator();
        isResponding = false;
        editor.disableSubmit = false;
        tui.requestRender();
        break;
      }
    }
  });

  chatContainer.addChild(new Text(theme.fg("muted", "Type a message. /clear resets, /quit exits.")));
  tui.addChild(chatContainer);
  tui.addChild(statusContainer);
  tui.addChild(editor);
  tui.setFocus(editor);

  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      tui.stop();
      process.exit(0);
    }
  });

  tui.start();

  await new Promise<void>(() => {});
}
