import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfigDir } from "./paths.ts";
import type { ChatSession, ChatSessionMeta } from "./types.ts";

/** Session ids are client-generated; keep them filesystem-safe (no path escapes). */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/** `~/.nyx/sessions.json`: the metadata index plus the last active session id. */
interface SessionsIndex {
  activeId?: string;
  sessions: ChatSessionMeta[];
}

/** Directory holding one JSONL transcript per session (`~/.nyx/sessions/<id>.jsonl`). */
export function getSessionsDir(): string {
  return join(getConfigDir(), "sessions");
}

function getSessionsIndexPath(): string {
  return join(getConfigDir(), "sessions.json");
}

/** One message per line, so a growing transcript is appended, not rewritten. */
function transcriptPath(id: string): string {
  return join(getSessionsDir(), `${id}.jsonl`);
}

/** Pre-JSONL transcript (a single `{ id, messages }` object); deleted on remove. */
function legacyTranscriptPath(id: string): string {
  return join(getSessionsDir(), `${id}.json`);
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (error) {
    if (isNotFoundError(error)) return fallback;
    throw error;
  }
}

/** Atomic write of raw content (temp file + rename) so a crash can't leave a half file. */
function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function readIndex(): SessionsIndex {
  const index = readJson<SessionsIndex>(getSessionsIndexPath(), { sessions: [] });
  return {
    ...(index.activeId ? { activeId: index.activeId } : {}),
    sessions: Array.isArray(index.sessions) ? index.sessions : [],
  };
}

function writeIndex(index: SessionsIndex): void {
  writeFileAtomic(getSessionsIndexPath(), JSON.stringify(index));
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

/** Metadata for every saved session: pinned first, then most recently updated. */
export function listSessions(): ChatSessionMeta[] {
  return readIndex()
    .sessions.slice()
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

/** Read one session (metadata + transcript); undefined when missing or invalid. */
export function getSession(id: string): ChatSession | undefined {
  if (!SESSION_ID_RE.test(id)) return undefined;
  const meta = readIndex().sessions.find((s) => s.id === id);
  if (!meta) return undefined;
  return { ...meta, messages: parseLines(readLines(transcriptPath(id))) };
}

/**
 * Upsert a session's transcript and metadata. `createdAt`/`pinned` are preserved
 * for an existing session; `updatedAt` is always refreshed.
 */
export function saveSession(session: {
  id: string;
  title: string;
  workspaceDir?: string;
  messages: unknown[];
}): ChatSessionMeta {
  if (!SESSION_ID_RE.test(session.id)) throw new Error(`invalid session id: ${session.id}`);
  const index = readIndex();
  const existing = index.sessions.find((s) => s.id === session.id);
  const now = new Date().toISOString();
  const workspaceDir = session.workspaceDir ?? existing?.workspaceDir;
  const meta: ChatSessionMeta = {
    id: session.id,
    title: session.title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(workspaceDir !== undefined ? { workspaceDir } : {}),
    ...(existing?.pinned ? { pinned: true } : {}),
  };

  writeTranscript(transcriptPath(session.id), session.messages);

  const sessions = existing
    ? index.sessions.map((s) => (s.id === session.id ? meta : s))
    : [...index.sessions, meta];
  writeIndex({ ...index, sessions });
  return meta;
}

/** Rename a session (does not change its recency). */
export function renameSession(id: string, title: string): ChatSessionMeta | undefined {
  const index = readIndex();
  const meta = index.sessions.find((s) => s.id === id);
  if (!meta) return undefined;
  const next: ChatSessionMeta = { ...meta, title };
  writeIndex({ ...index, sessions: index.sessions.map((s) => (s.id === id ? next : s)) });
  return next;
}

/** Pin/unpin a session (does not change its recency). */
export function setSessionPinned(id: string, pinned: boolean): ChatSessionMeta | undefined {
  const index = readIndex();
  const meta = index.sessions.find((s) => s.id === id);
  if (!meta) return undefined;
  const next: ChatSessionMeta = { ...meta };
  if (pinned) next.pinned = true;
  else delete next.pinned;
  writeIndex({ ...index, sessions: index.sessions.map((s) => (s.id === id ? next : s)) });
  return next;
}

/** Delete a session's transcript and metadata; clears `activeId` when it matched. */
export function removeSession(id: string): void {
  if (!SESSION_ID_RE.test(id)) return;
  rmSync(transcriptPath(id), { force: true });
  rmSync(legacyTranscriptPath(id), { force: true });
  const index = readIndex();
  const sessions = index.sessions.filter((s) => s.id !== id);
  if (index.activeId === id) writeIndex({ sessions });
  else writeIndex({ ...index, sessions });
}

/** Last session opened in the UI, if any. */
export function getActiveSessionId(): string | undefined {
  return readIndex().activeId;
}

/** Remember the last opened session (`null` clears it). */
export function setActiveSessionId(id: string | null): void {
  const index = readIndex();
  if (id === null) writeIndex({ sessions: index.sessions });
  else writeIndex({ ...index, activeId: id });
}
