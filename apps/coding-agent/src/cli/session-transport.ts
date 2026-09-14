import {
  readUIMessageStream,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

/** Unique-ish session id, matching the desktop's format. */
export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface SessionTransportOptions {
  /** Transcript prepended to every request so the model resumes with context. */
  history: UIMessage[];
  sessionId: string;
  workspaceDir: string;
  /** Called after each turn with the full transcript to persist. */
  onTurn: (sessionId: string, workspaceDir: string, messages: UIMessage[]) => void;
}

/**
 * Wraps a chat transport so the (stateless) remote agent sees the resumed
 * history on every turn, and persists the growing transcript after each turn.
 *
 * `@ai-sdk/tui` cannot seed its own message list, so history is injected here:
 * the model resumes with full context, but the TUI only renders new turns.
 */
export class SessionTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly inner: ChatTransport<UIMessage>,
    private readonly options: SessionTransportOptions,
  ) {}

  async sendMessages(
    args: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const messages = [...this.options.history, ...args.messages];
    const stream = await this.inner.sendMessages({ ...args, messages });
    const [forTui, forPersistence] = stream.tee();

    // Assemble the assistant reply off the tee'd branch and save the turn.
    void (async () => {
      let assistant: UIMessage | undefined;
      try {
        for await (const message of readUIMessageStream<UIMessage>({ stream: forPersistence })) {
          assistant = message;
        }
      } catch {
        return;
      }
      if (assistant && assistant.parts.length > 0) {
        this.options.onTurn(this.options.sessionId, this.options.workspaceDir, [...messages, assistant]);
      }
    })();

    return forTui;
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
