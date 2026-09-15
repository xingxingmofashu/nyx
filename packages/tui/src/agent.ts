import { DefaultChatTransport, type UIMessage } from "ai";
import { runAgentTUI } from "@ai-sdk/tui";
import { getAgentSettings, saveSession } from "@nyx/config";
import { newId } from "@nyx/shared";
import { sessionTitle } from "@nyx/shared/chat";
import { SessionTransport } from "./transport.ts";
import { startServerProcess } from "./server.ts";

export interface RunAgentOptions {
  /** Workspace the agent's tools are confined to. */
  workspaceDir: string;
  /** Transcript fed to the model as context when resuming. */
  history?: UIMessage[];
  /** Set when resuming an existing session; keeps its id and title. */
  resumed?: { id: string; title: string };
  /** Optional warning sink (e.g. the CLI logger). */
  onLog?: (message: string) => void;
}

/**
 * Run the master-brain agent TUI in the current terminal.
 *
 * The brain is a remote model; tools run in a short-lived local server child
 * process reached over HTTP with the AI SDK `DefaultChatTransport`. The
 * terminal UI is `@ai-sdk/tui`'s `runAgentTUI`. The session transcript is
 * persisted after each turn to the same store the desktop uses.
 */
export async function runAgent(options: RunAgentOptions): Promise<void> {
  const { workspaceDir, history = [], resumed, onLog } = options;
  const settings = getAgentSettings();
  const server = await startServerProcess();
  try {
    const sessionId = resumed?.id ?? newId();
    const transport = new SessionTransport(
      new DefaultChatTransport({
        api: `${server.url}/v1/agent`,
        headers: { Authorization: `Bearer ${server.token}` },
        body: { workspaceDir, sessionId },
      }),
      {
        history,
        sessionId,
        workspaceDir,
        onTurn: (id, dir, messages) => {
          try {
            saveSession({
              id,
              title: resumed?.title ?? sessionTitle(messages, "CLI session"),
              workspaceDir: dir,
              messages,
            });
          } catch (error) {
            onLog?.(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
      },
    );

    await runAgentTUI({
      title: settings.model ? `nyx agent (${settings.model})` : "nyx agent",
      transport,
      tools: "auto-collapsed",
      reasoning: "auto-collapsed",
    });
  } finally {
    await server.stop();
  }
}
