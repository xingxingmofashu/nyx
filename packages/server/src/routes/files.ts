import { mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { extname, isAbsolute, join, resolve } from "node:path"
import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { z } from "zod/v4"
import { Agent } from "@nyx/agent"
import { Global } from "@nyx/global"
import { nanoid } from "nanoid"
import { Errors } from "../errors.ts"

export class Files {
  private static readonly MAX_BYTES = 20 * 1024 * 1024

  private static readonly IMAGE_EXT: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/avif": ".avif",
  }

  private static readonly dataUrlRoute = createRoute({
    method: "get",
    path: "/data-url",
    request: { query: Agent.GeneratedFileQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ dataUrl: z.string().nullable() }) } },
        description: "File rendered as a data URL",
      },
    },
  })

  private static readonly attachmentRoute = createRoute({
    method: "post",
    path: "/attachments",
    request: {
      body: { content: { "application/json": { schema: Agent.AttachmentSaveRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Agent.SavedAttachmentSchema } },
        description: "Attachment copied into the workspace",
      },
    },
  })

  static create() {
    return new OpenAPIHono({ defaultHook: Errors.hook })
      .openapi(Files.dataUrlRoute, async (c) => {
        const { path, workspaceDir } = c.req.valid("query")
        return c.json({ dataUrl: await Files.readDataUrl(path, workspaceDir) }, 200)
      })
      .openapi(Files.attachmentRoute, async (c) => {
        try {
          return c.json(await Files.saveAttachment(c.req.valid("json")), 200)
        } catch (error) {
          throw Errors.status(400, error)
        }
      })
  }

  private static async readDataUrl(path: string, workspaceDir?: string): Promise<string | null> {
    const configured = workspaceDir ?? (await Global.Settings.read()).agent?.workspaceDir
    const workspaceRoot = configured ? resolve(configured) : undefined
    const target = isAbsolute(path) ? resolve(path) : resolve(workspaceRoot ?? Global.Path.sessions, path)
    try {
      for (const root of [Global.Path.sessions, ...(workspaceRoot ? [workspaceRoot] : [])]) {
        if (!Agent.Workspace.isWithin(root, target)) continue
        const realRoot = await realpath(root).catch(() => root)
        const realTarget = await realpath(target)
        if (!Agent.Workspace.isWithin(realRoot, realTarget)) continue
        const bytes = await readFile(realTarget)
        return `data:${Bun.file(path).type};base64,${bytes.toString("base64")}`
      }
      return null
    } catch {
      return null
    }
  }

  private static async saveAttachment(input: Agent.AttachmentSaveRequest): Promise<Agent.SavedAttachment> {
    if (!input.workspaceDir) throw new Error("Choose a workspace before attaching files")
    if (!Global.Session.isValidId(input.sessionId)) throw new Error("Invalid session id")
    if (!input.mimeType.startsWith("image/")) {
      throw new Error(`Unsupported attachment type: ${input.mimeType || "unknown"}`)
    }

    const data = Buffer.from(input.data, "base64")
    if (data.byteLength === 0) throw new Error("Empty attachment")
    if (data.byteLength > Files.MAX_BYTES) {
      throw new Error(`Attachment too large (max ${Files.MAX_BYTES / 1024 / 1024} MB)`)
    }

    const dir = new Global.Workspace(input.workspaceDir).attachmentsDir
    await mkdir(dir, { recursive: true })

    const name = Files.safeName(input.name)
    const ext = extname(name) || Files.IMAGE_EXT[input.mimeType] || ".png"
    const stem = name.slice(0, name.length - extname(name).length).slice(0, 60) || "image"
    const target = join(dir, `${input.sessionId}-${stem}-${nanoid()}${ext}`)
    await writeFile(target, data)

    return { path: target, name, mimeType: input.mimeType, size: data.byteLength }
  }

  private static safeName(name: string): string {
    const cleaned = name
      .replace(/[\\/]+/g, "-")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^[.-]+/, "")
      .slice(0, 64)
    return cleaned || "attachment"
  }
}
