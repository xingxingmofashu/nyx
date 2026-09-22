import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, extname, join } from "node:path"
import { LLM } from "@nyx/llm"
import { Global } from "@nyx/global"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Provider } from "../provider.ts"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./local-text-to-speech.txt"

export interface TextToSpeechToolOptions {
  cache: Provider
  workspaceDir: string
  sessionId?: string
  inlineAudio?: boolean
  models?: LLM.CachedModel[]
}

export class LocalTextToSpeech {
  static async create(options: TextToSpeechToolOptions): Promise<ToolSet> {
    const { cache, workspaceDir, sessionId, inlineAudio = false } = options
    const speechModels = (options.models ?? (await LLM.Model.list()))
      .filter((model) => model.task === "text-to-speech")
      .map((model) => model.id)
    if (speechModels.length === 0) return {}

    return {
      local_text_to_speech: tool({
        description: DESCRIPTION.replace("{{models}}", speechModels.join(", ")),
        inputSchema: z.object({
          model: z
            .enum(speechModels as [string, ...string[]])
            .describe("Installed local text-to-speech model id"),
          text: z.string().trim().min(1).describe("Text to synthesize into speech"),
          speaker: z
            .string()
            .optional()
            .describe("Optional speaker/voice embeddings path or URL (models that require them)"),
        }),
        toModelOutput: ({ output }) => ({
          type: "text",
          value:
            typeof output === "string"
              ? output
              : `Wrote ${output.path} (${output.seconds}s @ ${output.samplingRate} Hz)`,
        }),
        execute: async ({ model, text, speaker }, { abortSignal }) => {
          const provider = cache.get(() => new LLM.OnnxTextToSpeechProvider({ model }))
          const resolved = speaker ? LocalTextToSpeech.speaker(workspaceDir, speaker) : undefined
          const audio = await LocalTextToSpeech.race(
            provider.generate(text, resolved ? { speaker: resolved } : {}),
            abortSignal,
          )
          abortSignal?.throwIfAborted()

          const target = LocalTextToSpeech.unique(
            join(
              new Global.Workspace(workspaceDir).audioDir,
              LocalTextToSpeech.fileName(sessionId, model),
            ),
          )
          await mkdir(dirname(target), { recursive: true })
          const wav = Buffer.from(LLM.Wav.encodePcm16(audio.audio, audio.sampling_rate))
          await writeFile(target, wav)
          const seconds = Number((audio.audio.length / audio.sampling_rate).toFixed(1))
          if (inlineAudio) {
            return { path: target, seconds, samplingRate: audio.sampling_rate }
          }
          LocalTextToSpeech.playAloud(target)
          return `Wrote ${target} (${seconds}s @ ${audio.sampling_rate} Hz)`
        },
      }),
    }
  }

  private static async race<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise
    if (signal.aborted) throw signal.reason
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener("abort", onAbort, { once: true })
    })
    try {
      return await Promise.race([promise, aborted])
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort)
    }
  }

  private static speaker(workspaceDir: string, speaker: string): string {
    let url: URL
    try {
      url = new URL(speaker)
    } catch {
      return Workspace.resolve(workspaceDir, speaker)
    }
    if (url.protocol !== "https:") {
      throw new Error(`speaker must be an https URL or a workspace-relative path: ${speaker}`)
    }
    return url.toString()
  }

  private static fileName(sessionId: string | undefined, model: string): string {
    return `${LocalTextToSpeech.prefix(sessionId)}${LocalTextToSpeech.slug(model)}.wav`
  }

  private static prefix(sessionId: string | undefined): string {
    return sessionId !== undefined && Global.Session.isValidId(sessionId) ? `${sessionId}.` : ""
  }

  private static slug(model: string): string {
    return (model.split("/").pop() ?? model).replace(/[^a-zA-Z0-9_-]/g, "_")
  }

  private static unique(path: string): string {
    if (!existsSync(path)) return path
    const ext = extname(path)
    const stem = path.slice(0, path.length - ext.length)
    for (let i = 1; ; i++) {
      const candidate = `${stem}-${i}${ext}`
      if (!existsSync(candidate)) return candidate
    }
  }

  private static playAloud(path: string): void {
    if (process.platform !== "darwin") return
    try {
      spawn("afplay", [path], { detached: true, stdio: "ignore" })
        .on("error", () => undefined)
        .unref()
    } catch {}
  }
}
