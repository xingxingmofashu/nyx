/**
 * `nyx embed <text>` — one-shot local ONNX embedding.
 */

import { cmd } from "../utils/cmd";
import { buildEngine } from "../utils/engine";
import { cosineSimilarity } from "@nyx/llm";

interface EmbedArgs {
  text?: string;
  compare?: string;
}

export const EmbedCommand = cmd<Record<string, unknown>, EmbedArgs>({
  command: "embed <text>",
  describe: "Run a one-shot local ONNX embedding",
  builder: (yargs) =>
    yargs
      .positional("text", {
        type: "string",
        describe: "Text to embed",
      })
      .option("compare", {
        type: "string",
        description: "Second text; prints cosine similarity",
      }),
  handler: async (args: EmbedArgs) => {
    if (!args.text) {
      console.error("Usage: nyx embed <text> [--compare <other>]");
      process.exit(1);
    }
    const engine = buildEngine();
    if (!engine.embedder) {
      throw new Error("embed requires the local ONNX embedder");
    }
    console.error("Loading local ONNX model (first run downloads)...");
    const result = await engine.embedder.embed(args.text);
    console.log(
      JSON.stringify({ dim: result.dim, vector: result.vector }, null, 2),
    );
    if (args.compare) {
      const other = await engine.embedder.embed(args.compare);
      console.log(
        `\ncosine similarity: ${cosineSimilarity(result.vector, other.vector).toFixed(4)}`,
      );
    }
  },
});
