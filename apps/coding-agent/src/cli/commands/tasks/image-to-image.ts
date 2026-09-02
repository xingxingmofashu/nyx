/**
 * `nyx image-to-image <input>` — run a local ONNX image-to-image model
 * (e.g. super-resolution) on an image.
 */

import { extname } from "node:path";
import { log, spinner } from "@clack/prompts";
import { cmd } from "../../utils/cmd";
import { DEFAULT_IMAGE_TO_IMAGE_MODEL, OnnxImageToImageEngine } from "@nyx/llm";

interface ImageToImageArgs {
  input?: string;
  output?: string;
  model?: string;
}

export const ImageToImageCommand = cmd<Record<string, unknown>, ImageToImageArgs>({
  command: "image-to-image <input>",
  describe: "Run a local ONNX image-to-image model on an image",
  builder: (yargs) =>
    yargs
      .positional("input", {
        type: "string",
        describe: "Input image path or URL",
      })
      .option("output", {
        alias: "o",
        type: "string",
        description: "Output image path (defaults to <name>-image-to-image<ext>)",
      })
      .option("model", {
        type: "string",
        default: DEFAULT_IMAGE_TO_IMAGE_MODEL,
        description: "Local ONNX image-to-image model id",
      }),
  handler: async (args: ImageToImageArgs) => {
    if (!args.input) {
      log.error("Usage: nyx image-to-image <input> [--output <path>] [--model <id>]");
      process.exit(1);
    }

    const input = args.input;
    const ext = extname(input);
    const base = ext ? input.slice(0, -ext.length) : input;
    const output = args.output ?? `${base}-image-to-image${ext}`;

    const spin = spinner();
    spin.start("Loading local ONNX model (first run downloads)...");
    const engine = new OnnxImageToImageEngine({ model: args.model });
    const image = await engine.generateToFile(input, output);
    spin.stop("Done");

    log.success(`Image-to-image ${input} -> ${output} (${image.width}x${image.height})`);
    console.log(output);
  },
});
