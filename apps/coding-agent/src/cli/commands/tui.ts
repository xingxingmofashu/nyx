/**
 * `nyx` (no subcommand) — start the interactive chat TUI.
 */

import { cmd } from "../utils/cmd";
import { log } from "@clack/prompts";
import { Agent } from "@nyx/core";
import { OnnxTextGenerationProvider } from "@nyx/llm";
import { run } from "../../tui";
import { isatty } from "node:tty";

interface TuiArgs {
  model?: string;
}

export const TuiCommand = cmd<Record<string, unknown>, TuiArgs>({
  command: "$0",
  describe: "Start the interactive chat TUI",
  builder: (yargs) =>
    yargs.option("model", {
      type: "string",
      demandOption: true,
      description: "Local ONNX text-generation model id",
    }),
  handler: async (args: TuiArgs) => {
    if (!args.model) {
      log.error("Usage: nyx --model <id>");
      process.exit(1);
    }
    if (!isatty(process.stdin.fd)) {
      log.error(
        "Interactive mode needs a terminal. Use `nyx text-generation --message <text>` for one-shot output.",
      );
      process.exit(1);
    }
    const llm = new OnnxTextGenerationProvider({ model: args.model });
    await run({ agent: new Agent({ llm }), model: llm.model });
  },
});
