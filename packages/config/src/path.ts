import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const CONFIG_DIR_NAME = ".nyx";

/** Root config dir (`~/.nyx`); the single source of truth for on-disk layout. */
export function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}

/** Model weight cache dir; overridable via NYX_MODELS_DIR. */
export function getModelsDir(): string {
  return process.env.NYX_MODELS_DIR ?? join(getConfigDir(), "models");
}

/** Knowledge-base storage dir; overridable via NYX_KNOWLEDGE_DIR. */
export function getKnowledgeDir(): string {
  return process.env.NYX_KNOWLEDGE_DIR ?? join(getConfigDir(), "knowledge");
}

/** Root of the session store (`~/.nyx/sessions`), one dir per workspace. */
export function getSessionsDir(): string {
  return join(getConfigDir(), "sessions");
}

/** Normalize a workspace path so the desktop and the server derive the same key. */
export function canonicalWorkspaceDir(workspaceDir: string): string {
  return workspaceDir ? resolve(workspaceDir) : workspaceDir;
}

/**
 * Filesystem-safe, injective key for an absolute workspace path: `_` becomes
 * `__` and a literal `-` becomes `_-` first, then path separators become `-`
 * (`/Users/me/ai` → `-Users-me-ai`), so no two workspaces share a directory.
 * A path too long for a single name component falls back to a truncated key
 * plus a short hash of the full key.
 */
export function workspaceKey(workspaceDir: string): string {
  const key = canonicalWorkspaceDir(workspaceDir)
    .replace(/_/g, "__")
    .replace(/-/g, "_-")
    .replace(/[\\/]/g, "-");
  if (!key) return "_default";
  if (key.length <= 180) return key;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 8);
  return `${key.slice(0, 160)}-${hash}`;
}

/** Dir holding one workspace's sidecars, transcripts, and media. */
export function workspaceSessionsDir(workspaceDir: string): string {
  return join(getSessionsDir(), workspaceKey(workspaceDir));
}

/** Dir holding one workspace's generated speech clips. */
export function workspaceAudioDir(workspaceDir: string): string {
  return join(workspaceSessionsDir(workspaceDir), "audio");
}

/** Dir holding one workspace's generated image transforms. */
export function workspaceImageDir(workspaceDir: string): string {
  return join(workspaceSessionsDir(workspaceDir), "images");
}

/** Dir holding one workspace's user-uploaded chat attachments. */
export function workspaceAttachmentsDir(workspaceDir: string): string {
  return join(workspaceSessionsDir(workspaceDir), "attachments");
}
