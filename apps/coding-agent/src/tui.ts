import {
  Container,
  Editor,
  Key,
  ProcessTerminal,
  Spacer,
  Text,
  TuiMainScreen,
  matchesKey,
  type Component,
  type SlashCommand,
  type TUI,
  type TuiInputListenerResult,
} from "@earendil-works/pi-tui";
import type { AgentEvent, ModelMessage } from "@nyx/agent";
import { WorkspaceAutocompleteProvider } from "./autocomplete";
import { AssistantMessageComponent } from "./components/assistant-message";
import { ToolCallComponent } from "./components/tool-call";
import { UserMessageComponent } from "./components/user-message";
import { WorkingStatusIndicator } from "./components/status-indicator";
import { getEditorTheme, theme } from "./theme";

/** Safety cap on approval continuations within a single user turn. */
const MAX_APPROVAL_ROUNDS = 25;

/** Slash commands offered by the editor's autocomplete menu. */
const SLASH_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Reset the conversation transcript" },
  { name: "quit", description: "Exit the TUI (alias: /exit)" },
];

interface ChatTuiOptions {
  /** Header title line, e.g. `nyx agent (provider/model)`. */
  title: string;
  /** Header hint lines (already themed). */
  hint: string;
  /** Slash commands shown in the editor's `/` autocomplete menu. */
  slashCommands: SlashCommand[];
  /** Base directory for `@file` autocomplete. */
  basePath: string;
  /** Reset the conversation transcript; the chat view is cleared automatically. */
  onClear: () => void;
  /** Handle a submitted non-command message. */
  onSubmit: (text: string) => void | Promise<void>;
  /** Intercept raw key input before built-in handling; return true to consume it. */
  onInput?: (data: string) => boolean;
}

/**
 * Interactive chat shell: transcript view, editor, status indicator, slash
 * commands, and Ctrl+C/Ctrl+D handling. Callers own the conversation and stream
 * content into it via `addComponent`.
 */
class ChatTui {
  private readonly tui: TUI;
  private readonly chatContainer = new Container();
  private readonly statusContainer = new Container();
  private readonly editorContainer = new Container();
  private readonly editor: Editor;
  private workingIndicator: WorkingStatusIndicator | null = null;
  private isBusy = false;
  private shuttingDown = false;
  private lastSigintTime = 0;

  constructor(private readonly options: ChatTuiOptions) {
    const terminal = new ProcessTerminal();
    this.tui = new TuiMainScreen(terminal);

    const document = new Container();
    const header = new Container();
    document.addChild(header);
    document.addChild(this.chatContainer);

    this.editor = new Editor(this.tui, getEditorTheme() as never);
    this.editor.setAutocompleteProvider(
      new WorkspaceAutocompleteProvider(options.slashCommands, options.basePath),
    );
    this.editorContainer.addChild(this.editor);

    header.addChild(new Spacer());
    header.addChild(new Text(`${options.title}\n${options.hint}`));
    header.addChild(new Spacer());

    this.tui.addChild(document);
    this.tui.addChild(this.statusContainer);
    this.tui.addChild(this.editorContainer);
    this.tui.setFocus(this.editor);

    // Restore the terminal before dying on any uncaught throw.
    process.prependListener("uncaughtException", (error) => {
      if (!this.shuttingDown) this.tui.stop();
      console.error(error);
      process.exit(1);
    });
    for (const signal of ["SIGTERM", "SIGHUP"] as const) {
      process.prependListener(signal, () => this.shutdown());
    }

    this.editor.onSubmit = (text) => this.handleSubmit(text);
    this.tui.addInputListener((data) => this.handleInput(data));
  }

  addUserMessage(text: string): void {
    this.chatContainer.addChild(new UserMessageComponent(text));
    this.tui.requestRender();
  }

  /** Append an arbitrary component (assistant message, tool card, …). */
  addComponent(component: Component): void {
    this.chatContainer.addChild(component);
    this.tui.requestRender();
  }

  requestRender(): void {
    this.tui.requestRender();
  }

  showWorking(): void {
    if (this.workingIndicator) return;
    this.workingIndicator = new WorkingStatusIndicator(this.tui);
    this.statusContainer.addChild(this.workingIndicator);
    this.tui.requestRender();
  }

  clearWorking(): void {
    if (!this.workingIndicator) return;
    this.workingIndicator.dispose();
    this.workingIndicator = null;
    this.statusContainer.clear();
    this.tui.requestRender();
  }

  shutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.tui.stop();
    process.exit(0);
  }

  /** Start the UI and block until the process exits. */
  async run(): Promise<void> {
    this.tui.start();
    await new Promise<void>(() => {});
  }

  private handleSubmit(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.isBusy) return;

    if (trimmed.startsWith("/")) {
      const name = trimmed.slice(1).split(/\s+/, 1)[0] ?? "";
      this.editor.setText("");
      switch (name) {
        case "quit":
        case "exit":
          this.shutdown();
          return;
        case "clear":
          this.chatContainer.clear();
          this.options.onClear();
          this.tui.requestRender();
          return;
        default:
          this.addComponent(new Text(theme.fg("muted", `Unknown command: ${name ? `/${name}` : trimmed}`)));
          return;
      }
    }

    this.editor.setText("");
    this.addUserMessage(trimmed);
    this.isBusy = true;
    this.editor.disableSubmit = true;
    this.tui.requestRender();

    void (async () => {
      try {
        await this.options.onSubmit(trimmed);
      } catch (error) {
        this.addComponent(
          new Text(theme.fg("error", `Error: ${error instanceof Error ? error.message : String(error)}`)),
        );
      } finally {
        this.isBusy = false;
        this.editor.disableSubmit = false;
        this.tui.requestRender();
      }
    })();
  }

  private handleInput(data: string): TuiInputListenerResult {
    if (this.options.onInput?.(data)) return { consume: true };

    if (matchesKey(data, Key.ctrl("c"))) {
      const now = Date.now();
      if (now - this.lastSigintTime < 500) {
        this.shutdown();
      } else {
        this.editor.setText("");
        this.lastSigintTime = now;
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.ctrl("d"))) {
      if (this.editor.getText().length === 0) this.shutdown();
      return;
    }
    return;
  }
}

export interface AgentTuiOptions {
  /** Base URL of the local server exposing `/v1/agent`. */
  serverUrl: string;
  workspaceDir: string;
  modelLabel: string;
  /** Model ref override (`<providerId>/<modelId>`). */
  model?: string;
  /** Provider base URL override. */
  baseURL?: string;
}

interface AgentStreamRequest {
  messages: ModelMessage[];
  workspaceDir: string;
  model?: string;
  baseURL?: string;
}

/** POST the transcript to `/v1/agent` and yield the SSE `AgentEvent`s. */
async function* streamAgentEvents(
  serverUrl: string,
  request: AgentStreamRequest,
  signal?: AbortSignal,
): AsyncIterable<AgentEvent> {
  const response = await fetch(`${serverUrl}/v1/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`agent request failed: ${response.status} ${response.statusText}`);
  }
  for await (const data of readSseData(response.body)) {
    yield JSON.parse(data) as AgentEvent;
  }
}

/** Yield the `data:` payload of each SSE frame in the stream. */
async function* readSseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = frameData(frame);
      if (data !== null) yield data;
      index = buffer.indexOf("\n\n");
    }
  }
  const data = frameData(buffer);
  if (data !== null) yield data;
}

function frameData(frame: string): string | null {
  const lines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

interface PendingApproval {
  approvalId: string;
  toolName: string;
  input: unknown;
  reason?: string;
}

/** Approval part accepted by the AI SDK inside a `tool` message. */
interface ApprovalResponse {
  type: "tool-approval-response";
  approvalId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Master-brain TUI. The agent loop runs server-side; this renders streamed
 * text, tool cards, and inline y/n approvals over the ChatTui shell.
 */
export async function runAgentTui(options: AgentTuiOptions): Promise<void> {
  const transcript: ModelMessage[] = [];
  const overrides = { model: options.model, baseURL: options.baseURL };
  let approvalResolver: ((approved: boolean) => void) | null = null;
  let shell!: ChatTui;

  function askApproval(request: PendingApproval): Promise<boolean> {
    const detail = JSON.stringify(request.input);
    const card = new Text(
      theme.bg("customMessageBg", theme.fg("warning", ` ⚠ approve ${request.toolName} ${detail}  [y/N] `)),
    );
    shell.addComponent(card);
    return new Promise((resolve) => {
      approvalResolver = (approved) => {
        approvalResolver = null;
        card.setText(
          theme.fg(
            approved ? "success" : "muted",
            approved ? ` ✓ approved ${request.toolName}` : ` ⊘ denied ${request.toolName}`,
          ),
        );
        shell.requestRender();
        resolve(approved);
      };
    });
  }

  /** Drive one user turn, including any approval continuations. */
  async function runTurn(): Promise<void> {
    // Persist tool cards across approval continuations: the replay call emits a
    // tool-result for the original toolCallId without re-emitting the tool-call.
    const toolCards = new Map<string, ToolCallComponent>();
    let rounds = 0;

    for (;;) {
      const approvals: PendingApproval[] = [];
      let responseMessages: ModelMessage[] = [];
      let currentAssistant: AssistantMessageComponent | null = null;
      let assistantText = "";
      let failed = false;

      shell.showWorking();
      for await (const event of streamAgentEvents(options.serverUrl, {
        messages: transcript,
        workspaceDir: options.workspaceDir,
        ...overrides,
      })) {
        switch (event.type) {
          case "text-delta":
            shell.clearWorking();
            if (!currentAssistant) {
              currentAssistant = new AssistantMessageComponent("");
              shell.addComponent(currentAssistant);
            }
            assistantText += event.text;
            currentAssistant.updateText(assistantText);
            shell.requestRender();
            break;
          case "tool-call": {
            currentAssistant = null;
            assistantText = "";
            const card = new ToolCallComponent(event.toolName, event.input);
            toolCards.set(event.toolCallId, card);
            shell.addComponent(card);
            break;
          }
          case "tool-result":
            toolCards.get(event.toolCallId)?.setResult(event.output);
            shell.requestRender();
            break;
          case "tool-error":
            toolCards.get(event.toolCallId)?.setError(event.message);
            shell.requestRender();
            break;
          case "tool-denied":
            toolCards.get(event.toolCallId)?.setDenied();
            shell.requestRender();
            break;
          case "approval-request":
            approvals.push({
              approvalId: event.approvalId,
              toolName: event.toolName,
              input: event.input,
              reason: event.reason,
            });
            break;
          case "error":
            shell.clearWorking();
            shell.addComponent(new Text(theme.fg("error", `Error: ${event.message}`)));
            failed = true;
            break;
          case "finish":
            responseMessages = event.messages;
            break;
        }
      }
      shell.clearWorking();
      transcript.push(...responseMessages);

      if (failed || approvals.length === 0) return;

      if (++rounds > MAX_APPROVAL_ROUNDS) {
        shell.addComponent(new Text(theme.fg("error", "Too many approval rounds; stopping this turn.")));
        shell.requestRender();
        return;
      }

      const content: ApprovalResponse[] = [];
      for (const request of approvals) {
        const approved = await askApproval(request);
        content.push({
          type: "tool-approval-response",
          approvalId: request.approvalId,
          approved,
          reason: approved ? undefined : "user denied",
        });
      }
      transcript.push({ role: "tool", content });
    }
  }

  shell = new ChatTui({
    title: theme.bold(theme.fg("accent", "nyx")) + theme.fg("dim", ` agent (${options.modelLabel})`),
    hint:
      theme.fg("muted", `Workspace: ${options.workspaceDir}`) +
      "\n" +
      theme.fg("muted", "Type a message. / for commands, @ for files, /quit exits."),
    slashCommands: SLASH_COMMANDS,
    basePath: options.workspaceDir,
    onClear: () => {
      transcript.length = 0;
    },
    onSubmit: async (text) => {
      transcript.push({ role: "user", content: text });
      await runTurn();
    },
    onInput: (data) => {
      if (!approvalResolver) return false;
      if (data === "y" || data === "Y") {
        approvalResolver(true);
        return true;
      }
      if (data === "n" || data === "N" || data === "\r" || data === "\n") {
        approvalResolver(false);
        return true;
      }
      if (matchesKey(data, Key.ctrl("c"))) {
        approvalResolver(false);
        shell.shutdown();
        return true;
      }
      return true;
    },
  });

  await shell.run();
}
