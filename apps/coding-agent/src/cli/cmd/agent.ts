/**
 * `nyx` (no subcommand) — start the master-brain agent TUI.
 *
 * The brain is a remote model (API key); tools are local coding tools. The
 * TUI itself lives in `@nyx/tui`; this command parses arguments, validates the
 * agent settings, resolves the optional `--resume` session, and hands off.
 *
 * `--resume` picks a saved session (same store as the desktop) and feeds its
 * history to the model as context; `@ai-sdk/tui` cannot re-render past turns.
 */

import { isatty } from "node:tty";
import { resolve } from "node:path";
import { isCancel, log, select } from "@clack/prompts";
import type { UIMessage } from "ai";
import { getAgentSettings, getSession, listSessions } from "@nyx/config";
import { Provider } from "@nyx/agent/provider";
import { runAgent } from "@nyx/tui";
import { cmd } from "../cmd";

interface AgentArgs {
  cwd?: string;
  resume?: boolean;
}

export const AgentCommand = cmd<Record<string, unknown>, AgentArgs>({
  command: "$0",
  describe: "Start the master-brain agent TUI (remote model + local coding tools)",
  builder: (yargs) =>
    yargs
      .option("cwd", {
        type: "string",
        description: "Workspace directory (default: current directory)",
      })
      .option("resume", {
        type: "boolean",
        description: "Pick a saved session for this workspace and resume it (history as context)",
      }),
  handler: async (args: AgentArgs) => {
    if (!isatty(process.stdin.fd)) {
      log.error("Interactive mode needs a terminal.");
      process.exit(1);
    }

    const settings = getAgentSettings();
    try {
      Provider.resolveModelConfig(settings);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      log.info("Configure it in ~/.nyx/settings.json under agent.{model,provider}.");
      process.exit(1);
    }

    const workspaceDir = resolve(args.cwd ?? process.cwd());
    let history: UIMessage[] = [];
    let resumed: { id: string; title: string } | undefined;

    if (args.resume) {
      const metas = listSessions(workspaceDir);
      if (metas.length === 0) {
        log.warn(`No saved sessions for ${workspaceDir}.`);
      } else {
        const picked = await select({
          message: "Resume a session",
          options: metas.map((meta) => ({
            value: meta.id,
            label: meta.title,
            hint: new Date(meta.updatedAt).toLocaleString(),
          })),
        });
        if (isCancel(picked)) return;
        const stored = getSession(workspaceDir, picked);
        if (stored) {
          history = stored.messages as UIMessage[];
          resumed = { id: stored.id, title: stored.title };
          log.info(`Resumed "${stored.title}" — ${history.length} messages of context (prior turns are not re-rendered).`);
        }
      }
    }

    await runAgent({ workspaceDir, history, resumed, onLog: (message) => log.warn(message) });
  },
});
