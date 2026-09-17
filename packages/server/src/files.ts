import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { Global } from "@nyx/global";
import { mimeFor, newId } from "@nyx/shared";
import { isWithinPath } from "@nyx/shared/node";
import type { AttachmentSaveRequest, SavedAttachment } from "@nyx/agent/schema";

const MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/avif": ".avif",
};

function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 64);
  return cleaned || "attachment";
}

export async function readGeneratedFileDataUrl(path: string, workspaceDir?: string): Promise<string | null> {
  const configured = workspaceDir ?? (await Global.Settings.read()).agent?.workspaceDir ?? process.cwd();
  const workspaceRoot = resolve(configured);
  const target = isAbsolute(path) ? resolve(path) : resolve(workspaceRoot, path);
  try {
    for (const root of [workspaceRoot, Global.Path.sessions]) {
      if (!isWithinPath(root, target)) continue;
      const realRoot = await realpath(root).catch(() => root);
      const realTarget = await realpath(target);
      if (!isWithinPath(realRoot, realTarget)) continue;
      const bytes = await readFile(realTarget);
      return `data:${mimeFor(path)};base64,${bytes.toString("base64")}`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveAttachment(input: AttachmentSaveRequest): Promise<SavedAttachment> {
  if (!input.workspaceDir) throw new Error("Choose a workspace before attaching files");
  if (!Global.Session.isValidId(input.sessionId)) throw new Error("Invalid session id");
  if (!input.mimeType.startsWith("image/")) {
    throw new Error(`Unsupported attachment type: ${input.mimeType || "unknown"}`);
  }

  const data = Buffer.from(input.data, "base64");
  if (data.byteLength === 0) throw new Error("Empty attachment");
  if (data.byteLength > MAX_BYTES) {
    throw new Error(`Attachment too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  }

  const dir = new Global.Workspace(input.workspaceDir).attachmentsDir;
  await mkdir(dir, { recursive: true });

  const name = safeName(input.name);
  const ext = extname(name) || IMAGE_EXT[input.mimeType] || ".png";
  const stem = name.slice(0, name.length - extname(name).length).slice(0, 60) || "image";
  const target = join(dir, `${input.sessionId}-${stem}-${newId()}${ext}`);
  await writeFile(target, data);

  return { path: target, name, mimeType: input.mimeType, size: data.byteLength };
}
