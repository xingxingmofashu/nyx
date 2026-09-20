import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import { RawImage } from "@huggingface/transformers"
import { LLM } from "@nyx/llm"
import { Global } from "@nyx/global"
import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import { Provider } from "../provider.ts"
import { Workspace } from "../workspace.ts"
import DESCRIPTION from "./local-image-to-image.txt"

export interface ImageToImageToolOptions {
  cache: Provider
  workspaceDir: string
  sessionId?: string
}

export class LocalImageToImage {
  static async create(options: ImageToImageToolOptions): Promise<ToolSet> {
    const { cache, workspaceDir, sessionId } = options
    const root = resolve(workspaceDir)
    const imageModels = (await LLM.Model.list())
      .filter((model) => model.task === "image-to-image")
      .map((model) => model.id)
    if (imageModels.length === 0) return {}

    return {
      local_image_to_image: tool({
        description: DESCRIPTION.replace("{{models}}", imageModels.join(", ")),
        inputSchema: z.object({
          model: z
            .enum(imageModels as [string, ...string[]])
            .describe("Installed local image-to-image model id"),
          inputPath: z
            .string()
            .describe("Input image: a workspace-relative path, or the absolute path of an attachment"),
        }),
        toModelOutput: ({ output }) => ({
          type: "text",
          value:
            typeof output === "string"
              ? output
              : `Wrote ${output.path} (${output.width}x${output.height})`,
        }),
        execute: async ({ model, inputPath }, { abortSignal }) => {
          const source = Workspace.media(root, inputPath)
          const bytes = await readFile(source)
          const type = Bun.file(source).type
          const image = await RawImage.fromBlob(
            new Blob([bytes], { type: type === "application/octet-stream" ? "image/png" : type }),
          )
          abortSignal?.throwIfAborted()

          const provider = cache.get(() => new LLM.OnnxImageToImageProvider({ model }))
          const output = await LocalImageToImage.race(provider.generate(image), abortSignal)
          abortSignal?.throwIfAborted()

          const target = LocalImageToImage.unique(
            join(
              new Global.Workspace(workspaceDir).imageDir,
              LocalImageToImage.fileName(sessionId, model, inputPath),
            ),
          )
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, await output.toSharp().png().toBuffer())
          return { path: target, width: output.width, height: output.height }
        },
      }),
    }
  }

  private static race<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      }),
    ])
  }

  private static fileName(sessionId: string | undefined, model: string, inputPath: string): string {
    const prefix = LocalImageToImage.prefix(sessionId)
    let stem =
      basename(inputPath)
        .replace(/\.[^./\\]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_") || "image"
    if (prefix && stem.startsWith(prefix)) stem = stem.slice(prefix.length)
    return `${prefix}${stem}-${LocalImageToImage.slug(model)}.png`
  }

  private static prefix(sessionId: string | undefined): string {
    return sessionId !== undefined && Global.Session.isValidId(sessionId) ? `${sessionId}-` : ""
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
}
