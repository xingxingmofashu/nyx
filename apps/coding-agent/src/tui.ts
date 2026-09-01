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
import type { Agent, AgentMessage } from "@nyx/core";
import { UserMessageComponent } from "./components/user-message";
import { AssistantMessageComponent } from "./components/assistant-message";
import { WorkingStatusIndicator } from "./components/status-indicator";
import { editorTheme, mutedColor } from "./theme";

export interface TuiOptions {
  agent: Agent;
  model: string;
}

export async function run(options: TuiOptions): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui: TUI = new TuiMainScreen(terminal);
  const chatContainer = new Container();
  const statusContainer = new Container();

  let streamingReply: AssistantMessageComponent | null = null;
  let workingIndicator: WorkingStatusIndicator | null = null;

  function addMessageToChat(message: AgentMessage): void {
    if (message.role === "user") {
      chatContainer.addChild(new UserMessageComponent(message.text));
    } else if (message.role === "assistant") {
      streamingReply = new AssistantMessageComponent(message.text);
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

  const editor = new Editor(tui, editorTheme as never);
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
      addMessageToChat({ role: "user", text: trimmed });
      addMessageToChat({ role: "assistant", text: `Unknown command: ${trimmed}` });
      return;
    }

    isResponding = true;
    editor.disableSubmit = true;
    editor.setText("");
    addMessageToChat({ role: "user", text: trimmed });
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
          streamingReply.setText(event.message.text);
          clearWorkingIndicator();
          tui.requestRender();
        }
        break;
      case "message_end":
      case "agent_error": {
        if (streamingReply) {
          streamingReply.setText(
            event.type === "agent_error" ? `Error: ${event.error.message}` : event.message.text,
          );
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

  chatContainer.addChild(new Text(mutedColor("Type a message. /clear resets, /quit exits.")));
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
