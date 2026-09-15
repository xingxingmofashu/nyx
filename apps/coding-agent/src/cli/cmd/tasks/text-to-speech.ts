/** `nyx text-to-speech <text>` — synthesize speech with a local ONNX text-to-speech model. */

import { log, spinner } from "@clack/prompts";
import { writeFile } from "node:fs/promises";
import { cmd } from "../../cmd";
import { encodeWavPcm16, OnnxTextToSpeechProvider } from "@nyx/llm";

interface TextToSpeechArgs {
  text?: string;
  output?: string;
  model?: string;
  speaker?: string;
  speed?: number;
}

export const TextToSpeechCommand = cmd<Record<string, unknown>, TextToSpeechArgs>({
  command: "text-to-speech <text>",
  describe: "Synthesize speech from text with a local ONNX model",
  builder: (yargs) =>
    yargs
      .positional("text", {
        type: "string",
        describe: "Text to synthesize",
      })
      .option("output", {
        alias: "o",
        type: "string",
        description: "Output WAV path (defaults to <model>.wav)",
      })
      .option("model", {
        type: "string",
        demandOption: true,
        description: "Local ONNX text-to-speech model id",
      })
      .option("speaker", {
        type: "string",
        description: "Optional speaker/voice embeddings path or URL (models that require them)",
      })
      .option("speed", {
        type: "number",
        description: "Optional playback speed (models that support it)",
      }),
  handler: async (args: TextToSpeechArgs) => {
    if (!args.text || !args.model) {
      log.error("Usage: nyx text-to-speech <text> --model <id> [--output <path>]");
      process.exit(1);
    }

    const slug = (args.model.split("/").pop() ?? args.model).replace(/[^a-zA-Z0-9_-]/g, "_");
    const output = args.output ?? `${slug}.wav`;

    const spin = spinner();
    spin.start("Loading local ONNX model (first run downloads)...");
    const provider = new OnnxTextToSpeechProvider({ model: args.model });
    const audio = await provider.generate(args.text, {
      ...(args.speaker ? { speaker: args.speaker } : {}),
      ...(args.speed !== undefined ? { speed: args.speed } : {}),
    });
    await writeFile(output, encodeWavPcm16(audio.audio, audio.sampling_rate));
    spin.stop("Done");

    const seconds = (audio.audio.length / audio.sampling_rate).toFixed(1);
    log.success(`Text-to-speech -> ${output} (${seconds}s @ ${audio.sampling_rate} Hz)`);
    console.log(output);
  },
});
