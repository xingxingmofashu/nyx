/**
 * `nyx tui` — run the interactive chat TUI.
 */

import { cmd } from "../utils/cmd";
import { Agent } from "@nyx/core";
import { run } from "../../tui";
import { DEFAULT_TEXT_GENERATION_MODEL, OnnxTextGenerationProvider } from "@nyx/llm";
import { isatty } from "node:tty";

interface TuiArgs {
  model?: string;
}

export const TuiCommand = cmd<Record<string, unknown>, TuiArgs>({
  command: "tui",
  describe: "Run the interactive chat TUI",
  builder: (yargs) =>
    yargs.option("model", {
      type: "string",
      default: DEFAULT_TEXT_GENERATION_MODEL,
      description: "Local ONNX model id",
    }),
  handler: async (args: TuiArgs) => {
    if (!isatty(process.stdin.fd)) {
      console.error("nyx tui: interactive mode needs a terminal.");
      process.exit(1);
    }
    const llm = new OnnxTextGenerationProvider({ model: args.model });
    await run({ agent: new Agent({ llm }), model: llm.model });
  },
});
