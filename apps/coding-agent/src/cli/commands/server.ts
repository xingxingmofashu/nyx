/**
 * `nyx server` — run the HTTP server (fully local).
 */

import { cmd } from "../utils/cmd";
import { Agent } from "@nyx/core";
import { NyxServer } from "@nyx/server";
import { DEFAULT_TEXT_GENERATION_MODEL, OnnxTextGenerationProvider } from "@nyx/llm";

interface ServerArgs {
  port?: number;
  model?: string;
}

export const ServerCommand = cmd<Record<string, unknown>, ServerArgs>({
  command: "server",
  describe: "Run the nyx HTTP server",
  builder: (yargs) =>
    yargs
      .option("port", {
        type: "number",
        default: 3848,
        description: "Server port",
      })
      .option("model", {
        alias: "m",
        type: "string",
        default: DEFAULT_TEXT_GENERATION_MODEL,
        description: "Local ONNX model id",
      }),
  handler: async (args: ServerArgs) => {
    const llm = new OnnxTextGenerationProvider({ model: args.model });
    const server = new NyxServer({
      agent: new Agent({ llm }),
      port: args.port ?? 3848,
    });
    await server.start();
    console.log(`nyx server listening on ${server.url}`);
    console.log("Press Ctrl+C to stop.");
    await new Promise(() => {});
  },
});
