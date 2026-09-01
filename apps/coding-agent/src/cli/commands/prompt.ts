import { cmd } from "../utils/cmd";
import { buildEngine } from "../utils/engine";
import { DEFAULT_LOCAL_LLM } from "@nyx/llm";

interface PromptArgs {
  message?: string;
  model?: string;
}

export const PromptCommand = cmd<Record<string, unknown>, PromptArgs>({
  command: "prompt",
  describe: "Run a one-shot prompt with the local ONNX model",
  builder: (yargs) =>
    yargs
      .option("message", {
        alias: "m",
        type: "string",
        demandOption: true,
        description: "Message to send to the model",
      })
      .option("model", {
        type: "string",
        default: DEFAULT_LOCAL_LLM,
        description: "Local ONNX model id",
      }),
  handler: async (args: PromptArgs) => {
    if (!args.message) {
      console.error("Usage: nyx prompt --message <text> [--model <id>]");
      process.exit(1);
    }
    const engine = buildEngine({ model: args.model });
    const result = await engine.agent.prompt(args.message);
    console.log(result.text);
  },
});
