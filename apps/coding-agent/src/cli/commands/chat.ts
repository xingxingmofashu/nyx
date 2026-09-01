/**
 * `nyx chat` — one-shot local chat with the ONNX model.
 *
 * Usage:
 *   nyx chat --message "你好"
 *   nyx chat --model "<id>" --message "你好"
 */

import { cmd } from "../utils/cmd";
import { buildEngine } from "../utils/engine";
import { DEFAULT_LOCAL_LLM } from "@nyx/llm";

interface ChatArgs {
  message?: string;
  model?: string;
}

export const ChatCommand = cmd<Record<string, unknown>, ChatArgs>({
  command: "chat",
  describe: "Run a one-shot chat with the local ONNX model",
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
  handler: async (args: ChatArgs) => {
    if (!args.message) {
      console.error("Usage: nyx chat --message <text> [--model <id>]");
      process.exit(1);
    }
    const engine = buildEngine({ model: args.model });
    const result = await engine.agent.chat(args.message);
    console.log(result.text);
  },
});
