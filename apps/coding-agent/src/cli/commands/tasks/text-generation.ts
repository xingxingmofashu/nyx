import { cmd } from "../../utils/cmd";
import { OnnxTextGenerationProvider } from "@nyx/llm";
import { log } from "@clack/prompts";

interface TextGenerationArgs {
  message?: string;
  model?: string;
}

export const TextGenerationCommand = cmd<Record<string, unknown>, TextGenerationArgs>({
  command: "text-generation",
  describe: "Run a one-shot text-generation prompt with the local ONNX model",
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
        demandOption: true,
        description: "Local ONNX text-generation model id",
      }),
  handler: async (args: TextGenerationArgs) => {
    if (!args.message || !args.model) {
      log.error("Usage: nyx text-generation --message <text> --model <id>");
      process.exit(1);
    }
    const provider = new OnnxTextGenerationProvider({ model: args.model });
    let text = "";
    for await (const event of provider.stream([{ role: "user", content: args.message }])) {
      if (event.type === "text-delta") {
        text += event.delta;
      } else {
        log.error(event.message);
        process.exit(1);
      }
    }
    console.log(text.trim() ? text : "(no response)");
  },
});
