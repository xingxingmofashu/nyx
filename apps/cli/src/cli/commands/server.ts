/**
 * `nyx server` — run the HTTP server (fully local).
 */

import { cmd } from "../utils/cmd";
import { buildEngine } from "../utils/engine";
import { NyxServer } from "@nyx/server";
import { DEFAULT_LOCAL_LLM } from "@nyx/llm";

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
        default: DEFAULT_LOCAL_LLM,
        description: "Local ONNX model id",
      }),
  handler: async (args: ServerArgs) => {
    const engine = buildEngine({ model: args.model });
    if (!engine.embedder) {
      throw new Error("server requires the local ONNX embedder");
    }
    const server = new NyxServer({
      agent: engine.agent,
      embedder: engine.embedder,
      port: args.port ?? 3848,
    });
    await server.start();
    console.log(`nyx server listening on ${server.url}`);
    console.log("Press Ctrl+C to stop.");
    await new Promise(() => {});
  },
});
