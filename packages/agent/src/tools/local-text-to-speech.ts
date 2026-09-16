import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { encodeWavPcm16, listModels, OnnxTextToSpeechProvider } from "@nyx/llm";
import { workspaceAudioDir } from "@nyx/config";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { Provider } from "../provider.ts";
import DESCRIPTION from "./local-text-to-speech.txt";

/**
 * `local_text_to_speech`: synthesize speech with an installed ONNX model,
 * offering the installed text-to-speech models as an enum. The provider comes
 * from the shared cache so the agent reuses loaded weights, and the WAV is
 * written into the workspace session's audio folder — deleting a session also
 * deletes its clips, and the workspace itself stays untouched. Needs approval.
 */

export interface TextToSpeechToolOptions {
  cache: Provider;
  workspaceDir: string;
  sessionId?: string;
  /** Inline the generated audio in the result for clients that play it back. */
  inlineAudio?: boolean;
}

/** Build the `local_text_to_speech` tool; returns no tools when none are installed. */
export function createTextToSpeechTools(options: TextToSpeechToolOptions): ToolSet {
  const { cache, workspaceDir, sessionId, inlineAudio = false } = options;
  // Not realpath-resolved: the session folder is keyed off this exact path
  // (`workspaceKey`), and the app writes media with the same raw path.
  const speechModels = listModels()
    .filter((m) => m.task === "text-to-speech")
    .map((m) => m.id);
  if (speechModels.length === 0) return {};

  return {
    local_text_to_speech: tool({
      description: DESCRIPTION.replace("{{models}}", speechModels.join(", ")),
      inputSchema: z.object({
        model: z.enum(speechModels as [string, ...string[]]).describe("Installed local text-to-speech model id"),
        text: z.string().describe("Text to synthesize into speech"),
        speaker: z.string().optional().describe("Optional speaker/voice embeddings path or URL (models that require them)"),
      }),
      toModelOutput: ({ output }) => ({
        type: "text",
        value: typeof output === "string" ? output : `Wrote ${output.path} (${output.seconds}s @ ${output.samplingRate} Hz)`,
      }),
      execute: async ({ model, text, speaker }, { abortSignal }) => {
        const provider = cache.get(model, () => new OnnxTextToSpeechProvider({ model }));
        const audio = await provider.generate(text, speaker ? { speaker } : {});
        throwIfAborted(abortSignal);

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
    }),
  };
}

/** Clip file name, prefixed with the session id so removing a session finds it. */
function speechFileName(sessionId: string | undefined, model: string): string {
  const slug = (model.split("/").pop() ?? model).replace(/[^a-zA-Z0-9_-]/g, "_");
  const prefix = sessionId && /^[A-Za-z0-9_-]+$/.test(sessionId) ? `${sessionId}-` : "";
  return `${prefix}${slug}.wav`;
}

/** Avoid clobbering an existing derived output: append -1, -2, … before the extension. */
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
