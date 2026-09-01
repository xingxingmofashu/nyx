/**
 * `nyx tui` — run the interactive chat TUI.
 */

import { cmd } from "../utils/cmd";
import { buildEngine } from "../utils/engine";
import { run } from "../../tui";
import { DEFAULT_LOCAL_LLM } from "@nyx/llm";
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
      default: DEFAULT_LOCAL_LLM,
      description: "Local ONNX model id",
    }),
  handler: async (args: TuiArgs) => {
    if (!isatty(process.stdin.fd)) {
      console.error("nyx tui: interactive mode needs a terminal.");
      process.exit(1);
    }
    const engine = buildEngine({ model: args.model });
    await run({ agent: engine.agent, model: engine.llm.model });
  },
});
