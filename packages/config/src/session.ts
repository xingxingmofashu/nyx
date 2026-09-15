import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import {
  canonicalWorkspaceDir,
  getSessionsDir,
  workspaceAttachmentsDir,
  workspaceAudioDir,
  workspaceImageDir,
  workspaceSessionsDir,
} from "./path.ts";
import type { ChatSession, ChatSessionMeta } from "./types.ts";

/** Session ids are client-generated; keep them filesystem-safe (no path escapes). */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Session store layout (per workspace):
 *
 *   ~/.nyx/sessions/<workspaceKey>/
 *     <id>.json    metadata sidecar: { id, title, workspaceDir, pinned?, createdAt, updatedAt }
 *     <id>.jsonl   transcript (append-mostly)
 *     active       last-opened session id (plain text)
 *     audio/       generated speech clips (`<id>-<model>.wav`)
 *     images/      generated image transforms (`<id>-<input>-<model>.png`)
 *     attachments/ user-uploaded chat attachments (`<id>-<name>`)
 *
 * Every file has a single writer, so there is no shared mutable index to guard
 * with cross-process locks.
 */

/** Metadata sidecar for one session. */
function metaPath(workspaceDir: string, id: string): string {
  return join(workspaceSessionsDir(workspaceDir), `${id}.json`);
}

/** One message per line, so a growing transcript is appended, not rewritten. */
function transcriptPath(workspaceDir: string, id: string): string {
  return join(workspaceSessionsDir(workspaceDir), `${id}.jsonl`);
}

/** Plain-text record of the last opened session. */
function activePath(workspaceDir: string): string {
  return join(workspaceSessionsDir(workspaceDir), "active");
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Atomic write (temp file + rename) so a crash can't leave a half file. */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic.sync(path, content);
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
  writeAtomic(path, serialized.map((line) => `${line}\n`).join(""));
}

/** Parse and shape-check one metadata sidecar; undefined when missing/corrupt/legacy. */
function readMeta(path: string, fallbackWorkspaceDir?: string): ChatSessionMeta | undefined {
  let stored: unknown;
  try {
    stored = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
  if (!stored || typeof stored !== "object") return undefined;
  const meta = stored as Partial<ChatSessionMeta>;
  if (typeof meta.id !== "string" || !SESSION_ID_RE.test(meta.id)) return undefined;
  if (typeof meta.title !== "string") return undefined;
  if (typeof meta.createdAt !== "string" || typeof meta.updatedAt !== "string") return undefined;
  const workspaceDir = typeof meta.workspaceDir === "string" ? meta.workspaceDir : fallbackWorkspaceDir;
  if (workspaceDir === undefined) return undefined;
  return {
    id: meta.id,
    title: meta.title,
    workspaceDir,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    ...(meta.pinned ? { pinned: true } : {}),
  };
}

/** Read every valid sidecar directly under one workspace dir. */
function listWorkspaceSessions(dir: string, fallbackWorkspaceDir?: string): ChatSessionMeta[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
  const metas: ChatSessionMeta[] = [];
  for (const name of names) {
    // `index.json` is the legacy shared index, not a session sidecar.
    if (!name.endsWith(".json") || name === "index.json") continue;
    const meta = readMeta(join(dir, name), fallbackWorkspaceDir);
    if (meta) metas.push(meta);
  }
  return metas;
}

/** Pinned first, then most recently updated. */
function compareSessions(a: ChatSessionMeta, b: ChatSessionMeta): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Metadata for every saved session, optionally limited to one workspace. */
export function listSessions(workspaceDir?: string): ChatSessionMeta[] {
  if (workspaceDir !== undefined) {
    const canonical = canonicalWorkspaceDir(workspaceDir);
    return listWorkspaceSessions(workspaceSessionsDir(canonical), canonical).sort(compareSessions);
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
    sessions.push(...listWorkspaceSessions(join(getSessionsDir(), entry.name)));
  }
  return sessions.sort(compareSessions);
}

/** Read one session (metadata + transcript); undefined when missing or invalid. */
export function getSession(workspaceDir: string, id: string): ChatSession | undefined {
  if (!SESSION_ID_RE.test(id)) return undefined;
  const canonical = canonicalWorkspaceDir(workspaceDir);
  const meta = readMeta(metaPath(canonical, id), canonical);
  if (!meta) return undefined;
  return { ...meta, messages: parseLines(readLines(transcriptPath(canonical, id))) };
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
  const existing = readMeta(metaPath(workspaceDir, session.id), workspaceDir);
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
  writeAtomic(metaPath(workspaceDir, session.id), JSON.stringify(meta));
  return meta;
}

/** Rename a session (does not change its recency). */
export function renameSession(workspaceDir: string, id: string, title: string): ChatSessionMeta | undefined {
  const canonical = canonicalWorkspaceDir(workspaceDir);
  const meta = readMeta(metaPath(canonical, id), canonical);
  if (!meta) return undefined;
  const next: ChatSessionMeta = { ...meta, title };
  writeAtomic(metaPath(canonical, id), JSON.stringify(next));
  return next;
}

/** Pin/unpin a session (does not change its recency). */
export function setSessionPinned(
  workspaceDir: string,
  id: string,
  pinned: boolean,
): ChatSessionMeta | undefined {
  const canonical = canonicalWorkspaceDir(workspaceDir);
  const meta = readMeta(metaPath(canonical, id), canonical);
  if (!meta) return undefined;
  const next: ChatSessionMeta = { ...meta };
  if (pinned) next.pinned = true;
  else delete next.pinned;
  writeAtomic(metaPath(canonical, id), JSON.stringify(next));
  return next;
}

/** Delete a session's transcript, generated media, and metadata; clears `active` when it matched. */
export function removeSession(workspaceDir: string, id: string): void {
  if (!SESSION_ID_RE.test(id)) return;
  const canonical = canonicalWorkspaceDir(workspaceDir);
  rmSync(transcriptPath(canonical, id), { force: true });
  rmSync(metaPath(canonical, id), { force: true });
  removeSessionFiles(workspaceAudioDir(canonical), id);
  removeSessionFiles(workspaceImageDir(canonical), id);
  removeSessionFiles(workspaceAttachmentsDir(canonical), id);
  if (getActiveSessionId(canonical) === id) clearActiveSessionId(canonical);
}

/** Delete every file a session generated in `dir` (named `<id>-…`). */
function removeSessionFiles(dir: string, id: string): void {
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
  try {
    const id = readFileSync(activePath(canonicalWorkspaceDir(workspaceDir)), "utf-8").trim();
    return SESSION_ID_RE.test(id) ? id : undefined;
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

/** Remember the last opened session in one workspace (`null` clears it). */
export function setActiveSessionId(workspaceDir: string, id: string | null): void {
  const canonical = canonicalWorkspaceDir(workspaceDir);
  if (id === null) {
    clearActiveSessionId(canonical);
    return;
  }
  if (!SESSION_ID_RE.test(id)) throw new Error(`invalid session id: ${id}`);
  writeAtomic(activePath(canonical), id);
}

function clearActiveSessionId(workspaceDir: string): void {
  rmSync(activePath(workspaceDir), { force: true });
}
