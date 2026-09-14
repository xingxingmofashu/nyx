/**
 * `nyx` (no subcommand) — start the master-brain agent TUI.
 *
 * The brain is a remote model (API key); tools are local coding tools. The
 * agent loop runs in a short-lived local server child process, reached over HTTP
 * with the AI SDK `DefaultChatTransport`; the terminal UI is `@ai-sdk/tui`'s
 * `runAgentTUI` (streaming output, tool cards, reasoning, approvals).
 */

import { isatty } from "node:tty";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import { DefaultChatTransport } from "ai";
import { runAgentTUI } from "@ai-sdk/tui";
import { start } from "@nyx/server";
import { getAgentSettings } from "@nyx/config";
import { resolveModelConfig } from "@nyx/agent";
import { cmd } from "../utils/cmd";

interface AgentArgs {
  cwd?: string;
  model?: string;
  /** yargs camelizes `--base-url`; mapped to `baseURL` on the request. */
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
        description: 'Override the brain model ref ("<providerId>/<modelId>")',
      })
      .option("base-url", {
        type: "string",
        description: "Override the resolved provider base URL",
      }),
  handler: async (args: AgentArgs) => {
    if (!isatty(process.stdin.fd)) {
      log.error("Interactive mode needs a terminal.");
      process.exit(1);
    }

    const settings = getAgentSettings();
    const model = args.model ?? settings.model;
    try {
      resolveModelConfig({ ...settings, model });
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      log.info("Configure it in ~/.nyx/settings.json under agent.{model,provider}.");
      process.exit(1);
    }

    const workspaceDir = resolve(args.cwd ?? process.cwd());
    const server = await start({ port: 0 });
    try {
      await runAgentTUI({
        title: model ? `nyx agent (${model})` : "nyx agent",
        transport: new DefaultChatTransport({
          api: `${server.url}/v1/agent`,
          body: { workspaceDir, model: args.model, baseURL: args.baseUrl },
        }),
        tools: "auto-collapsed",
        reasoning: "auto-collapsed",
      });
    } finally {
      await server.stop();
    }
  },
});
