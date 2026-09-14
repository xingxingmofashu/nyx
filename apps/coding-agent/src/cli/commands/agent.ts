/**
 * `nyx` (no subcommand) — start the master-brain agent TUI.
 *
 * The brain is a remote model (API key); tools are local coding tools. The
 * agent loop runs in a short-lived local server child process, reached over HTTP.
 */

import { isatty } from "node:tty";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import { start } from "@nyx/server";
import { getAgentSettings } from "@nyx/config";
import { cmd } from "../utils/cmd";
import { runAgentTui } from "../../tui";

interface AgentArgs {
  cwd?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
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
      .option("model", {
        type: "string",
        description: "Override the configured brain model",
      })
      .option("provider", {
        type: "string",
        description: "Override the configured brain provider",
      })
      .option("base-url", {
        type: "string",
        description: "Override the configured brain base URL",
      }),
  handler: async (args: AgentArgs) => {
    if (!isatty(process.stdin.fd)) {
      log.error("Interactive mode needs a terminal.");
      process.exit(1);
    }

    const settings = getAgentSettings();
    const provider = args.provider ?? settings.provider;
    const model = args.model ?? settings.model;
    if (!provider || !model || !settings.apiKey) {
      log.error(
        "Master brain is not configured. Set agent.{provider,model,apiKey} in ~/.nyx/settings.json " +
          "or NYX_AGENT_PROVIDER / NYX_AGENT_MODEL / NYX_AGENT_API_KEY.",
      );
      process.exit(1);
    }
    if (provider === "openai-compatible" && !(args.baseUrl ?? settings.baseUrl)) {
      log.error(
        "Provider openai-compatible needs a base URL. Set agent.baseUrl in ~/.nyx/settings.json " +
          "or NYX_AGENT_BASE_URL (or pass --base-url).",
      );
      process.exit(1);
    }

    const workspaceDir = resolve(args.cwd ?? process.cwd());
    const server = await start({ port: 0 });
    try {
      await runAgentTui({
        serverUrl: server.url,
        workspaceDir,
        modelLabel: `${provider}/${model}`,
        model: args.model,
        provider: args.provider,
        baseUrl: args.baseUrl,
      });
    } finally {
      await server.stop();
    }
  },
});
