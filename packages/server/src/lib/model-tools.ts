import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { RawImage } from "@huggingface/transformers";
import { workspaceAudioDir, workspaceImageDir } from "@nyx/config";
import { mimeFor } from "@nyx/shared";
import {
  encodeWavPcm16,
  list,
  OnnxImageToImageProvider,
  OnnxTextToSpeechProvider,
} from "@nyx/llm";
import { z } from "zod/v4";
import type { AgentTool, AgentToolSet } from "@nyx/agent";
import { ProviderCache } from "./provider-cache";
import { mediaPath } from "./workspace";

/**
 * Expose locally installed ONNX models as agent tools: one tool per task, each
 * offering the installed models of that task as an enum. Providers come from
 * the shared cache, so the agent reuses loaded weights. Both tasks write into
 * the workspace's session folder (images/, audio/) so deleting a session also
 * deletes its generated files — and so the workspace itself stays untouched.
 * Both need approval.
 */
export function createModelTools(options: {
  cache: ProviderCache;
  workspaceDir: string;
  sessionId?: string;
  inlineAudio?: boolean;
}): AgentToolSet {
  const { cache, workspaceDir, sessionId, inlineAudio = false } = options;
  // Not realpath-resolved: the session folder is keyed off this exact path
  // (`workspaceKey`), and the app writes media with the same raw path.
  const root = resolve(workspaceDir);
  const installed = list();
  const imageModels = installed.filter((m) => m.task === "image-to-image").map((m) => m.id);
  const speechModels = installed.filter((m) => m.task === "text-to-speech").map((m) => m.id);

  const tools: AgentToolSet = [];

  if (imageModels.length > 0) {
    tools.push({
      name: "local_image_to_image",
      description:
        `Transform an image with a local ONNX model and save the result into the session's image folder, where the client shows it (requires approval). ` +
        `Installed image models: ${imageModels.join(", ")}.`,
      approval: "always",
      inputSchema: z.object({
        model: z.enum(imageModels as [string, ...string[]]).describe("Installed local image-to-image model id"),
        inputPath: z
          .string()
          .describe("Input image: a workspace-relative path, or the absolute path of an attachment"),
      }),
      toModelOutput: (output) =>
        typeof output === "string"
          ? output
          : `Wrote ${output.path} (${output.width}x${output.height})`,
      execute: async ({ model, inputPath }, ctx) => {
        const source = mediaPath(root, inputPath);
        const bytes = await readFile(source);
        const image = await RawImage.fromBlob(new Blob([bytes], { type: mimeFor(source, "image/png") }));
        throwIfAborted(ctx.signal);

        const provider = cache.get(model, () => new OnnxImageToImageProvider({ model }));
        const output = await provider.generate(image);
        throwIfAborted(ctx.signal);

        const target = uniqueOutputPath(
          join(workspaceImageDir(workspaceDir), imageFileName(sessionId, model, inputPath)),
        );
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, await output.toSharp().png().toBuffer());
        return { path: target, width: output.width, height: output.height };
      },
    });
  }

  if (speechModels.length > 0) {
    tools.push({
      name: "local_text_to_speech",
      description:
        `Synthesize speech from text with a local ONNX model and save a WAV file to the session's audio folder; the client plays it back (requires approval). ` +
        `Installed text-to-speech models: ${speechModels.join(", ")}.`,
      approval: "always",
      inputSchema: z.object({
        model: z.enum(speechModels as [string, ...string[]]).describe("Installed local text-to-speech model id"),
        text: z.string().describe("Text to synthesize into speech"),
        speaker: z.string().optional().describe("Optional speaker/voice embeddings path or URL (models that require them)"),
      }),
      toModelOutput: (output) =>
        typeof output === "string"
          ? output
          : `Wrote ${output.path} (${output.seconds}s @ ${output.samplingRate} Hz)`,
      execute: async ({ model, text, speaker }, ctx) => {
        const provider = cache.get(model, () => new OnnxTextToSpeechProvider({ model }));
        const audio = await provider.generate(text, speaker ? { speaker } : {});
        throwIfAborted(ctx.signal);

        const target = uniqueOutputPath(
          join(workspaceAudioDir(workspaceDir), speechFileName(sessionId, model)),
        );
        await mkdir(dirname(target), { recursive: true });
        const wav = Buffer.from(encodeWavPcm16(audio.audio, audio.sampling_rate));
        await writeFile(target, wav);
        const seconds = Number((audio.audio.length / audio.sampling_rate).toFixed(1));
        if (inlineAudio) {
          // The desktop plays the WAV by reading it back from the audio folder,
          // so return only the reference: keeps the transcript (and its session
          // file) small instead of embedding the whole clip as base64.
          return { path: target, seconds, samplingRate: audio.sampling_rate };
        }
        // Terminal clients cannot render audio: play it on this machine so the
        // agent still answers out loud, and keep the result a one-line string.
        playAloud(target);
        return `Wrote ${target} (${seconds}s @ ${audio.sampling_rate} Hz)`;
      },
    });
  }

  return tools;
}

/**
 * Image file name: session id (so removing a session finds it) + input stem +
 * model slug, e.g. `<id>-cat-4x_APISR_GRL_GAN.png`.
 */
function imageFileName(sessionId: string | undefined, model: string, inputPath: string): string {
  const slug = (model.split("/").pop() ?? model).replace(/[^a-zA-Z0-9_-]/g, "_");
  const prefix = sessionId && /^[A-Za-z0-9_-]+$/.test(sessionId) ? `${sessionId}-` : "";
  let stem = basename(inputPath).replace(/\.[^./\\]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "image";
  // An attachment's file name already starts with the session id; don't repeat it.
  if (prefix && stem.startsWith(prefix)) stem = stem.slice(prefix.length);
  return `${prefix}${stem}-${slug}.png`;
}

/** Clip file name, prefixed with the session id so removing a session finds it. */
function speechFileName(sessionId: string | undefined, model: string): string {
  const slug = (model.split("/").pop() ?? model).replace(/[^a-zA-Z0-9_-]/g, "_");
  const prefix = sessionId && /^[A-Za-z0-9_-]+$/.test(sessionId) ? `${sessionId}-` : "";
  return `${prefix}${slug}.wav`;
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

/** Play a local WAV aloud on macOS (detached, so it does not block the agent). No-op elsewhere. */
function playAloud(path: string): void {
  if (process.platform !== "darwin") return;
  try {
    spawn("afplay", [path], { detached: true, stdio: "ignore" })
      .on("error", () => undefined)
      .unref();
  } catch {
    // Playback is best-effort; the file is still written.
  }
}
