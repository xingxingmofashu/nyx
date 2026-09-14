/** `nyx text-to-audio <text>` — synthesize speech with a local ONNX text-to-audio model. */

import { log, spinner } from "@clack/prompts";
import { cmd } from "../../utils/cmd";
import { OnnxTextToAudioProvider } from "@nyx/llm";

interface TextToAudioArgs {
  text?: string;
  output?: string;
  model?: string;
  speaker?: string;
  speed?: number;
  maxNewTokens?: number;
}

export const TextToAudioCommand = cmd<Record<string, unknown>, TextToAudioArgs>({
  command: "text-to-audio <text>",
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
        description: "Local ONNX text-to-audio model id",
      })
      .option("speaker", {
        type: "string",
        description: "Optional speaker/voice embeddings path or URL (models that require them)",
      })
      .option("speed", {
        type: "number",
        description: "Optional playback speed (models that support it)",
      })
      .option("max-new-tokens", {
        type: "number",
        description: "Generation length in audio tokens (MusicGen only)",
      }),
  handler: async (args: TextToAudioArgs) => {
    if (!args.text || !args.model) {
      log.error("Usage: nyx text-to-audio <text> --model <id> [--output <path>]");
      process.exit(1);
    }

    const slug = (args.model.split("/").pop() ?? args.model).replace(/[^a-zA-Z0-9_-]/g, "_");
    const output = args.output ?? `${slug}.wav`;

    const spin = spinner();
    spin.start("Loading local ONNX model (first run downloads)...");
    const provider = new OnnxTextToAudioProvider({ model: args.model });
    const audio = await provider.generate(args.text, {
      ...(args.speaker ? { speaker: args.speaker } : {}),
      ...(args.speed !== undefined ? { speed: args.speed } : {}),
      ...(args.maxNewTokens !== undefined ? { maxNewTokens: args.maxNewTokens } : {}),
    });
    await audio.save(output);
    spin.stop("Done");

    const seconds = (audio.audio.length / audio.sampling_rate).toFixed(1);
    log.success(`Text-to-audio -> ${output} (${seconds}s @ ${audio.sampling_rate} Hz)`);
    console.log(output);
  },
});
