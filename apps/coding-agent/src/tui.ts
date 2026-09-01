import {
  Container,
  Editor,
  Key,
  ProcessTerminal,
  Spacer,
  Text,
  TuiMainScreen,
  matchesKey,
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

  // Component tree: document (header + chat), status, editor
  const documentContainer = new Container();
  const headerContainer = new Container();
  const chatContainer = new Container();
  const statusContainer = new Container();
  const editorContainer = new Container();

  documentContainer.addChild(headerContainer);
  documentContainer.addChild(chatContainer);

  let streamingReply: AssistantMessageComponent | null = null;
  let workingIndicator: WorkingStatusIndicator | null = null;
  let isResponding = false;
  let shuttingDown = false;

  // =========================================================================
  // Shutdown
  // =========================================================================

  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    tui.stop(); // restore cooked mode, cursor, and terminal state
    process.exit(0);
  }

  // Restore the terminal before dying on any uncaught throw.
  process.prependListener("uncaughtException", (error) => {
    if (!shuttingDown) {
      tui.stop();
    }
    console.error(error);
    process.exit(1);
  });

  for (const signal of ["SIGTERM", "SIGHUP"] as const) {
    process.prependListener(signal, () => shutdown());
  }

  // =========================================================================
  // Message rendering
  // =========================================================================

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

  // =========================================================================
  // Editor
  // =========================================================================

  const editor = new Editor(tui, getEditorTheme() as never);
  editorContainer.addChild(editor);

  editor.onSubmit = (text) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding) return;

    if (trimmed === "/quit" || trimmed === "/exit") {
      editor.setText("");
      shutdown();
      return;
    }
    if (trimmed === "/clear") {
      chatContainer.clear();
      tui.requestRender();
      return;
    }
    if (trimmed.startsWith("/")) {
      editor.setText("");
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

  // =========================================================================
  // Header
  // =========================================================================

  const logo = theme.bold(theme.fg("accent", "nyx")) + theme.fg("dim", ` (${options.model})`);
  headerContainer.addChild(new Spacer());
  headerContainer.addChild(new Text(`${logo}\n${theme.fg("muted", "Type a message. /clear resets, /quit exits.")}`));
  headerContainer.addChild(new Spacer());

  // =========================================================================
  // Mount & input handling
  // =========================================================================

  tui.addChild(documentContainer);
  tui.addChild(statusContainer);
  tui.addChild(editorContainer);
  tui.setFocus(editor);

  let lastSigintTime = 0;
  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      const now = Date.now();
      if (now - lastSigintTime < 500) {
        shutdown();
      } else {
        editor.setText("");
        lastSigintTime = now;
        tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.ctrl("d"))) {
      if (editor.getText().length === 0) {
        shutdown();
      }
      return;
    }
  });

  tui.start();
  await new Promise<void>(() => {});
}
