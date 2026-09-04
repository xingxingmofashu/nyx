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
import type { LLMMessage, TextProvider } from "@nyx/llm";
import { UserMessageComponent } from "./components/user-message";
import { AssistantMessageComponent } from "./components/assistant-message";
import { WorkingStatusIndicator } from "./components/status-indicator";
import { getEditorTheme, theme } from "./theme";

export interface TuiOptions {
  /** Text-generation provider backing the chat. */
  llm: TextProvider;
  model: string;
}

export async function run(options: TuiOptions): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui: TUI = new TuiMainScreen(terminal);

  // Local transcript for the conversation. Each turn replays the whole
  // history to the provider (stateless multi-turn — a future server-backed
  // client sends the same array over HTTP).
  const transcript: LLMMessage[] = [];
  const assistantText = (message: string): void => {
    if (transcript[transcript.length - 1]?.role === "assistant") {
      transcript[transcript.length - 1]!.content = message;
    } else {
      transcript.push({ role: "assistant", content: message });
    }
  };

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

  function addUserMessage(text: string): void {
    chatContainer.addChild(new UserMessageComponent(text));
    tui.requestRender();
  }

  function startAssistantMessage(): void {
    streamingReply = new AssistantMessageComponent("");
    chatContainer.addChild(streamingReply);
    tui.requestRender();
  }

  function updateAssistantMessage(text: string): void {
    if (streamingReply) {
      streamingReply.updateText(text);
      clearWorkingIndicator();
      tui.requestRender();
    }
  }

  function endAssistantMessage(): void {
    streamingReply = null;
    clearWorkingIndicator();
    isResponding = false;
    editor.disableSubmit = false;
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
      transcript.length = 0;
      chatContainer.clear();
      tui.requestRender();
      return;
    }
    if (trimmed.startsWith("/")) {
      editor.setText("");
      addUserMessage(trimmed);
      assistantText(`Unknown command: ${trimmed}`);
      updateAssistantMessage(`Unknown command: ${trimmed}`);
      endAssistantMessage();
      return;
    }

    isResponding = true;
    editor.disableSubmit = true;
    editor.setText("");
    addUserMessage(trimmed);
    transcript.push({ role: "user", content: trimmed });
    startAssistantMessage();
    showWorkingIndicator();

    void (async () => {
      let full = "";
      let errorText: string | null = null;
      try {
        for await (const event of options.llm.stream(transcript)) {
          if (event.type === "text-delta") {
            full += event.delta;
            updateAssistantMessage(full);
          } else {
            errorText = `Error: ${event.message}`;
            updateAssistantMessage(errorText);
            break;
          }
        }
      } catch (error) {
        errorText = `Error: ${error instanceof Error ? error.message : String(error)}`;
        updateAssistantMessage(errorText);
      }
      assistantText(errorText ?? (full.trim() ? full : "(no response)"));
      endAssistantMessage();
    })();
  };

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
