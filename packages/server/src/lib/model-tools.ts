import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { RawImage } from "@huggingface/transformers";
import {
  encodeWavPcm16,
  list,
  OnnxImageToImageProvider,
  OnnxTextToSpeechProvider,
} from "@nyx/llm";
import { z } from "zod/v4";
import type { AgentTool, AgentToolSet } from "@nyx/agent";
import { ProviderCache } from "./provider-cache";
import { realpathNearest, workspacePath } from "./workspace";

/**
 * Expose locally installed ONNX models as agent tools: one tool per task, each
 * offering the installed models of that task as an enum. Providers come from
 * the shared cache, so the agent reuses loaded weights. Both tasks write into
 * the workspace, so they need approval.
 */
export function createModelTools(options: { cache: ProviderCache; workspaceDir: string }): AgentToolSet {
  const { cache, workspaceDir } = options;
  const root = realpathNearest(resolve(workspaceDir));
  const installed = list();
  const imageModels = installed.filter((m) => m.task === "image-to-image").map((m) => m.id);
  const speechModels = installed.filter((m) => m.task === "text-to-speech").map((m) => m.id);

  const tools: AgentToolSet = [];

  if (imageModels.length > 0) {
    tools.push({
      name: "local_image_to_image",
      description:
        `Transform an image with a local ONNX model and write the result into the workspace (requires approval). ` +
        `Installed image models: ${imageModels.join(", ")}.`,
      approval: "always",
      inputSchema: z.object({
        model: z.enum(imageModels as [string, ...string[]]).describe("Installed local image-to-image model id"),
        inputPath: z.string().describe("Input image path relative to the workspace root"),
        outputPath: z.string().optional().describe("Output path relative to the workspace root (default: <input>-<model>.png)"),
      }),
      execute: async ({ model, inputPath, outputPath }, ctx) => {
        const source = workspacePath(root, inputPath);
        const bytes = await readFile(source);
        const image = await RawImage.fromBlob(new Blob([bytes], { type: mimeFor(source) }));
        throwIfAborted(ctx.signal);

        const provider = cache.get(model, () => new OnnxImageToImageProvider({ model }));
        const output = await provider.generate(image);
        throwIfAborted(ctx.signal);

        const target = outputPath
          ? workspacePath(root, outputPath)
          : uniqueOutputPath(workspacePath(root, defaultOutputPath(inputPath, model)));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, await output.toSharp().png().toBuffer());
        return `Wrote ${relative(root, target).split(sep).join("/")} (${output.width}x${output.height})`;
      },
    });
  }

  if (speechModels.length > 0) {
    tools.push({
      name: "local_text_to_speech",
      description:
        `Synthesize speech from text with a local ONNX model and write a WAV file into the workspace (requires approval). ` +
        `Installed text-to-speech models: ${speechModels.join(", ")}.`,
      approval: "always",
      inputSchema: z.object({
        model: z.enum(speechModels as [string, ...string[]]).describe("Installed local text-to-speech model id"),
        text: z.string().describe("Text to synthesize into speech"),
        speaker: z.string().optional().describe("Optional speaker/voice embeddings path or URL (models that require them)"),
        outputPath: z.string().optional().describe("Output .wav path relative to the workspace root (default: <model>.wav)"),
      }),
      execute: async ({ model, text, speaker, outputPath }, ctx) => {
        const provider = cache.get(model, () => new OnnxTextToSpeechProvider({ model }));
        const audio = await provider.generate(text, speaker ? { speaker } : {});
        throwIfAborted(ctx.signal);

        const target = outputPath
          ? workspacePath(root, outputPath)
          : uniqueOutputPath(workspacePath(root, defaultSpeechOutputPath(model)));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(encodeWavPcm16(audio.audio, audio.sampling_rate)));
        const seconds = (audio.audio.length / audio.sampling_rate).toFixed(1);
        return `Wrote ${relative(root, target).split(sep).join("/")} (${seconds}s @ ${audio.sampling_rate} Hz)`;
      },
    });
  }

  return tools;
}

/** Default output path next to the input, suffixed with the model slug. */
function defaultOutputPath(inputPath: string, model: string): string {
  const stem = inputPath.replace(/\.[^./\\]+$/, "");
  const slug = (model.split("/").pop() ?? model).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${stem}-${slug}.png`;
}

/** Default WAV path named after the model slug. */
function defaultSpeechOutputPath(model: string): string {
  const slug = (model.split("/").pop() ?? model).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${slug}.wav`;
}

/** Avoid clobbering an existing derived output: append -1, -2, … before `.png`. */
function uniqueOutputPath(path: string): string {
  if (!existsSync(path)) return path;
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  for (let i = 1; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("cancelled");
}

/** Best-effort image MIME from the file extension; defaults to PNG. */
function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}
