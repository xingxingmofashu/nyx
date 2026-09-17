import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { RawImage } from "@huggingface/transformers";
import { LLM } from "@nyx/llm";
import { Global } from "@nyx/global";
import { mimeFor } from "@nyx/shared";
import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { Provider } from "../provider.ts";
import { mediaPath } from "../workspace";
import DESCRIPTION from "./local-image-to-image.txt";

/**
 * `local_image_to_image`: transform an image with an installed ONNX model,
 * offering the installed image-to-image models as an enum. The provider comes
 * from the shared cache so the agent reuses loaded weights, and the result is
 * written into the workspace session's image folder — deleting a session also
 * deletes its derived images, and the workspace itself stays untouched. Needs
 * approval.
 */

export interface ImageToImageToolOptions {
  cache: Provider;
  workspaceDir: string;
  sessionId?: string;
}

/** Build the `local_image_to_image` tool; returns no tools when none are installed. */
export async function createImageToImageTools(options: ImageToImageToolOptions): Promise<ToolSet> {
  const { cache, workspaceDir, sessionId } = options;
  const root = resolve(workspaceDir);
  const imageModels = (await LLM.Model.list())
    .filter((m) => m.task === "image-to-image")
    .map((m) => m.id);
  if (imageModels.length === 0) return {};

  return {
    local_image_to_image: tool({
      description: DESCRIPTION.replace("{{models}}", imageModels.join(", ")),
      inputSchema: z.object({
        model: z.enum(imageModels as [string, ...string[]]).describe("Installed local image-to-image model id"),
        inputPath: z
          .string()
          .describe("Input image: a workspace-relative path, or the absolute path of an attachment"),
      }),
      toModelOutput: ({ output }) => ({
        type: "text",
        value: typeof output === "string" ? output : `Wrote ${output.path} (${output.width}x${output.height})`,
      }),
      execute: async ({ model, inputPath }, { abortSignal }) => {
        const source = mediaPath(root, inputPath);
        const bytes = await readFile(source);
        const image = await RawImage.fromBlob(new Blob([bytes], { type: mimeFor(source, "image/png") }));
        throwIfAborted(abortSignal);

        const provider = cache.get(model, () => new LLM.OnnxImageToImageProvider({ model }));
        const output = await provider.generate(image);
        throwIfAborted(abortSignal);

        const target = uniqueOutputPath(
          join(new Global.Workspace(workspaceDir).imageDir, imageFileName(sessionId, model, inputPath)),
        );
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, await output.toSharp().png().toBuffer());
        return { path: target, width: output.width, height: output.height };
      },
    }),
  };
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
