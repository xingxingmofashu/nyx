import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { getConfigDir } from "./paths.ts";
import type { ChatSession, ChatSessionMeta } from "./types.ts";

/** Session ids are client-generated; keep them filesystem-safe (no path escapes). */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/** One workspace's session index: `~/.nyx/sessions/<key>/index.json`. */
interface WorkspaceIndex {
  workspaceDir: string;
  activeId?: string;
  sessions: ChatSessionMeta[];
}

/** Root of the session store (`~/.nyx/sessions`), one dir per workspace. */
export function getSessionsDir(): string {
  return join(getConfigDir(), "sessions");
}

/** Normalize a workspace path so the desktop and the server derive the same key. */
function canonicalWorkspaceDir(workspaceDir: string): string {
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

/** Dir holding one workspace's index, transcripts, and audio. */
export function workspaceSessionsDir(workspaceDir: string): string {
  return join(getSessionsDir(), workspaceKey(workspaceDir));
}

/** Dir holding one workspace's generated speech clips. */
export function workspaceAudioDir(workspaceDir: string): string {
  return join(workspaceSessionsDir(workspaceDir), "audio");
}

function indexPath(workspaceDir: string): string {
  return join(workspaceSessionsDir(workspaceDir), "index.json");
}

/** One message per line, so a growing transcript is appended, not rewritten. */
function transcriptPath(workspaceDir: string, id: string): string {
  return join(workspaceSessionsDir(workspaceDir), `${id}.jsonl`);
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Atomic write of raw content (temp file + rename) so a crash can't leave a half file. */
function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/** Non-empty lines of a JSONL file ([] when missing). */
function readLines(path: string): string[] {
  try {
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
}

/** Parse JSONL messages, dropping a line left truncated by a crash mid-append. */
function parseLines(lines: string[]): unknown[] {
  const messages: unknown[] = [];
  for (const line of lines) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      // ignore the bad line
    }
  }
  return messages;
}

/**
 * Persist a transcript as JSONL: append when the file is an unchanged prefix of
 * the new messages (the common case — a turn adds a user + assistant message),
 * otherwise rewrite atomically (an approval response mutates the last message).
 */
function writeTranscript(path: string, incoming: unknown[]): void {
  const stored = readLines(path);
  const serialized = incoming.map((message) => JSON.stringify(message));

  let common = 0;
  while (common < stored.length && common < serialized.length && stored[common] === serialized[common]) {
    common++;
  }

  if (common === stored.length && serialized.length === common) return;
  if (common === stored.length) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, serialized.slice(common).map((line) => `${line}\n`).join(""));
    return;
  }
  writeFileAtomic(path, serialized.map((line) => `${line}\n`).join(""));
}

/** Read one workspace's index dir; undefined when the dir holds no valid index. */
function readIndexAtDir(dir: string): WorkspaceIndex | undefined {
  let stored: WorkspaceIndex | undefined;
  try {
    stored = JSON.parse(readFileSync(join(dir, "index.json"), "utf-8")) as WorkspaceIndex;
  } catch {
    // Missing or corrupt index: skip this workspace so the cross-workspace
    // list still works instead of throwing.
    return undefined;
  }
  if (!stored || typeof stored.workspaceDir !== "string") return undefined;
  const sessions = (Array.isArray(stored.sessions) ? stored.sessions : []).map((meta) => ({
    ...meta,
    workspaceDir: stored.workspaceDir,
  }));
  return {
    workspaceDir: stored.workspaceDir,
    ...(stored.activeId ? { activeId: stored.activeId } : {}),
    sessions,
  };
}

/** One workspace's index; an empty one (bound to `workspaceDir`) when absent. */
function readIndex(workspaceDir: string): WorkspaceIndex {
  return readIndexAtDir(workspaceSessionsDir(workspaceDir)) ?? { workspaceDir, sessions: [] };
}

function writeIndex(workspaceDir: string, index: WorkspaceIndex): void {
  writeFileAtomic(indexPath(workspaceDir), JSON.stringify(index));
}

/** Pinned first, then most recently updated. */
function compareSessions(a: ChatSessionMeta, b: ChatSessionMeta): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Metadata for every saved session, optionally limited to one workspace. */
export function listSessions(workspaceDir?: string): ChatSessionMeta[] {
  if (workspaceDir !== undefined) {
    return readIndex(workspaceDir).sessions.slice().sort(compareSessions);
  }
  let entries;
  try {
    entries = readdirSync(getSessionsDir(), { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
  const sessions: ChatSessionMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    sessions.push(...(readIndexAtDir(join(getSessionsDir(), entry.name))?.sessions ?? []));
  }
  return sessions.sort(compareSessions);
}

/** Read one session (metadata + transcript); undefined when missing or invalid. */
export function getSession(workspaceDir: string, id: string): ChatSession | undefined {
  if (!SESSION_ID_RE.test(id)) return undefined;
  const meta = readIndex(workspaceDir).sessions.find((s) => s.id === id);
  if (!meta) return undefined;
  return { ...meta, messages: parseLines(readLines(transcriptPath(workspaceDir, id))) };
}

/**
 * Upsert a session's transcript and metadata. `createdAt`/`pinned` are preserved
 * for an existing session; `updatedAt` is always refreshed.
 */
export function saveSession(session: {
  workspaceDir: string;
  id: string;
  title: string;
  messages: unknown[];
}): ChatSessionMeta {
  if (!SESSION_ID_RE.test(session.id)) throw new Error(`invalid session id: ${session.id}`);
  const workspaceDir = canonicalWorkspaceDir(session.workspaceDir);
  const index = readIndex(workspaceDir);
  const existing = index.sessions.find((s) => s.id === session.id);
  const now = new Date().toISOString();
  const meta: ChatSessionMeta = {
    id: session.id,
    title: session.title,
    workspaceDir,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing?.pinned ? { pinned: true } : {}),
  };

  writeTranscript(transcriptPath(workspaceDir, session.id), session.messages);

  const sessions = existing
    ? index.sessions.map((s) => (s.id === session.id ? meta : s))
    : [...index.sessions, meta];
  writeIndex(workspaceDir, { ...index, workspaceDir, sessions });
  return meta;
}

/** Rename a session (does not change its recency). */
export function renameSession(workspaceDir: string, id: string, title: string): ChatSessionMeta | undefined {
  const index = readIndex(workspaceDir);
  const meta = index.sessions.find((s) => s.id === id);
  if (!meta) return undefined;
  const next: ChatSessionMeta = { ...meta, title };
  writeIndex(workspaceDir, { ...index, sessions: index.sessions.map((s) => (s.id === id ? next : s)) });
  return next;
}

/** Pin/unpin a session (does not change its recency). */
export function setSessionPinned(
  workspaceDir: string,
  id: string,
  pinned: boolean,
): ChatSessionMeta | undefined {
  const index = readIndex(workspaceDir);
  const meta = index.sessions.find((s) => s.id === id);
  if (!meta) return undefined;
  const next: ChatSessionMeta = { ...meta };
  if (pinned) next.pinned = true;
  else delete next.pinned;
  writeIndex(workspaceDir, { ...index, sessions: index.sessions.map((s) => (s.id === id ? next : s)) });
  return next;
}

/** Delete a session's transcript, audio, and metadata; clears `activeId` when it matched. */
export function removeSession(workspaceDir: string, id: string): void {
  if (!SESSION_ID_RE.test(id)) return;
  rmSync(transcriptPath(workspaceDir, id), { force: true });
  removeAudioFiles(workspaceDir, id);
  const index = readIndex(workspaceDir);
  const sessions = index.sessions.filter((s) => s.id !== id);
  if (index.activeId === id) writeIndex(workspaceDir, { workspaceDir, sessions });
  else writeIndex(workspaceDir, { ...index, sessions });
}

/** Delete every clip the session generated (named `<id>-<model>.wav`). */
function removeAudioFiles(workspaceDir: string, id: string): void {
  const dir = workspaceAudioDir(workspaceDir);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
  for (const name of names) {
    if (name.startsWith(`${id}-`)) rmSync(join(dir, name), { force: true });
  }
}

/** Last session opened in one workspace, if any. */
export function getActiveSessionId(workspaceDir: string): string | undefined {
  return readIndex(workspaceDir).activeId;
}

/** Remember the last opened session in one workspace (`null` clears it). */
export function setActiveSessionId(workspaceDir: string, id: string | null): void {
  const index = readIndex(workspaceDir);
  if (id === null) {
    if (index.activeId === undefined) return;
    writeIndex(workspaceDir, { workspaceDir, sessions: index.sessions });
    return;
  }
  writeIndex(workspaceDir, { ...index, activeId: id });
}
