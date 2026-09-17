import { dirname, join } from "node:path"
import fs from "fs-extra"
import { z } from "zod/v4"
import { Path } from "./path.ts"
import { Workspace } from "./workspace.ts"

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/

const StoredMetaSchema = z
  .object({
    id: z.string().regex(SESSION_ID_RE),
    title: z.string(),
    workspaceDir: z.string().optional(),
    pinned: z.boolean().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .loose()

export interface ChatSessionMeta {
  id: string
  title: string
  workspaceDir: string
  pinned?: boolean
  createdAt: string
  updatedAt: string
}

export interface ChatSession extends ChatSessionMeta {
  messages: unknown[]
}

export interface SessionSaveInput {
  workspaceDir: string
  id: string
  title: string
  messages: unknown[]
}

export class Session {
  static isValidId(id: string): boolean {
    return SESSION_ID_RE.test(id)
  }

  static async list(workspaceDir?: string): Promise<ChatSessionMeta[]> {
    if (workspaceDir !== undefined) {
      const workspace = new Workspace(workspaceDir)
      const metas = await Session.listWorkspace(workspace.sessionsDir, workspace.canonical)
      return metas.sort(Session.compare)
    }
    const entries = await fs.readdir(Path.sessions).catch(() => [] as string[])
    const metas: ChatSessionMeta[] = []
    for (const name of entries) {
      metas.push(...(await Session.listWorkspace(join(Path.sessions, name))))
    }
    return metas.sort(Session.compare)
  }

  static async read(workspaceDir: string, id: string): Promise<ChatSession | undefined> {
    if (!Session.isValidId(id)) return undefined
    const workspace = new Workspace(workspaceDir)
    const meta = await Session.readMeta(Session.metaPath(workspace, id), workspace.canonical)
    if (!meta) return undefined
    const text = await Bun.file(Session.transcriptPath(workspace, id)).text().catch(() => "")
    return { ...meta, messages: Bun.JSONL.parse(text) }
  }

  static async save(input: SessionSaveInput): Promise<ChatSessionMeta> {
    if (!Session.isValidId(input.id)) throw new Error(`invalid session id: ${input.id}`)
    const workspace = new Workspace(input.workspaceDir)
    const existing = await Session.readMeta(Session.metaPath(workspace, input.id), workspace.canonical)
    const now = new Date().toISOString()
    const meta: ChatSessionMeta = {
      id: input.id,
      title: input.title,
      workspaceDir: workspace.canonical,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.pinned ? { pinned: true } : {}),
    }
    await Session.writeTranscript(Session.transcriptPath(workspace, input.id), input.messages)
    await fs.outputJson(Session.metaPath(workspace, input.id), meta, { spaces: 2 })
    return meta
  }

  static async rename(workspaceDir: string, id: string, title: string): Promise<ChatSessionMeta | undefined> {
    const workspace = new Workspace(workspaceDir)
    const meta = await Session.readMeta(Session.metaPath(workspace, id), workspace.canonical)
    if (!meta) return undefined
    const next: ChatSessionMeta = { ...meta, title }
    await fs.outputJson(Session.metaPath(workspace, id), next, { spaces: 2 })
    return next
  }

  static async setPinned(workspaceDir: string, id: string, pinned: boolean): Promise<ChatSessionMeta | undefined> {
    const workspace = new Workspace(workspaceDir)
    const meta = await Session.readMeta(Session.metaPath(workspace, id), workspace.canonical)
    if (!meta) return undefined
    const next: ChatSessionMeta = { ...meta }
    if (pinned) next.pinned = true
    else delete next.pinned
    await fs.outputJson(Session.metaPath(workspace, id), next, { spaces: 2 })
    return next
  }

  static async remove(workspaceDir: string, id: string): Promise<void> {
    if (!Session.isValidId(id)) return
    const workspace = new Workspace(workspaceDir)
    await fs.remove(Session.transcriptPath(workspace, id))
    await fs.remove(Session.metaPath(workspace, id))
    await Session.removeFiles(workspace.audioDir, id)
    await Session.removeFiles(workspace.imageDir, id)
    await Session.removeFiles(workspace.attachmentsDir, id)
    if ((await Session.activeId(workspaceDir)) === id) await Session.setActiveId(workspaceDir, null)
  }

  static async activeId(workspaceDir: string): Promise<string | undefined> {
    const workspace = new Workspace(workspaceDir)
    const id = (await Bun.file(Session.activePath(workspace)).text().catch(() => "")).trim()
    return Session.isValidId(id) ? id : undefined
  }

  static async setActiveId(workspaceDir: string, id: string | null): Promise<void> {
    const workspace = new Workspace(workspaceDir)
    if (id === null) {
      await fs.remove(Session.activePath(workspace))
      return
    }
    if (!Session.isValidId(id)) throw new Error(`invalid session id: ${id}`)
    await fs.ensureDir(workspace.sessionsDir)
    await Bun.write(Session.activePath(workspace), id)
  }

  private static metaPath(workspace: Workspace, id: string): string {
    return join(workspace.sessionsDir, `${id}.json`)
  }

  private static transcriptPath(workspace: Workspace, id: string): string {
    return join(workspace.sessionsDir, `${id}.jsonl`)
  }

  private static activePath(workspace: Workspace): string {
    return join(workspace.sessionsDir, "active")
  }

  private static async readMeta(path: string, fallbackWorkspaceDir?: string): Promise<ChatSessionMeta | undefined> {
    const raw = await Bun.file(path).json().catch(() => undefined)
    const parsed = StoredMetaSchema.safeParse(raw)
    if (!parsed.success) return undefined
    const { id, title, createdAt, updatedAt, pinned } = parsed.data
    const workspaceDir = parsed.data.workspaceDir ?? fallbackWorkspaceDir
    if (workspaceDir === undefined) return undefined
    return { id, title, workspaceDir, createdAt, updatedAt, ...(pinned ? { pinned: true } : {}) }
  }

  private static async listWorkspace(dir: string, fallbackWorkspaceDir?: string): Promise<ChatSessionMeta[]> {
    const names = await fs.readdir(dir).catch(() => [] as string[])
    const metas: ChatSessionMeta[] = []
    for (const name of names) {
      if (!name.endsWith(".json") || name === "index.json") continue
      const meta = await Session.readMeta(join(dir, name), fallbackWorkspaceDir)
      if (meta) metas.push(meta)
    }
    return metas
  }

  private static compare(a: ChatSessionMeta, b: ChatSessionMeta): number {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  }

  private static async writeTranscript(path: string, incoming: unknown[]): Promise<void> {
    const stored = (await Bun.file(path).text().catch(() => ""))
      .split("\n")
      .filter((line) => line.length > 0)
    const serialized = incoming.map((message) => JSON.stringify(message))

    let common = 0
    while (common < stored.length && common < serialized.length && stored[common] === serialized[common]) {
      common++
    }

    if (common === stored.length && serialized.length === common) return
    await fs.ensureDir(dirname(path))
    if (common === stored.length) {
      await fs.appendFile(path, serialized.slice(common).map((line) => `${line}\n`).join(""))
      return
    }
    await Bun.write(path, serialized.map((line) => `${line}\n`).join(""))
  }

  private static async removeFiles(dir: string, id: string): Promise<void> {
    const names = await fs.readdir(dir).catch(() => [] as string[])
    await Promise.all(names.filter((name) => name.startsWith(`${id}-`)).map((name) => fs.remove(join(dir, name))))
  }
}
