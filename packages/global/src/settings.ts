import { join } from "node:path"
import { defu } from "defu"
import fs from "fs-extra"
import { z } from "zod/v4"
import { Path } from "./path.ts"

export const AgentProviderOptionsSchema = z
  .object({
    baseURL: z.string().optional(),
    apiKey: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .catchall(z.unknown())

export const AgentProviderLimitSchema = z
  .object({
    context: z.union([z.number(), z.string()]).optional(),
    output: z.number().optional(),
  })
  .loose()

export const AgentProviderEntrySchema = z
  .object({
    npm: z.string(),
    name: z.string().optional(),
    modelsUrl: z.string().optional(),
    options: AgentProviderOptionsSchema.optional(),
    limit: AgentProviderLimitSchema.optional(),
  })
  .loose()

export const AgentToolsSettingsSchema = z
  .object({
    localModels: z.boolean().optional(),
    knowledge: z.boolean().optional(),
    webSearch: z.boolean().optional(),
  })
  .loose()

export const AgentPermissionActionSchema = z.enum(["allow", "ask", "deny"])

export const AgentPermissionRuleSchema = z.union([
  AgentPermissionActionSchema,
  z.record(z.string(), AgentPermissionActionSchema),
])

export const AgentPermissionSchema = z.union([
  AgentPermissionActionSchema,
  z.record(z.string(), AgentPermissionRuleSchema),
])

export const AgentCompactionSchema = z
  .object({
    auto: z.boolean().optional(),
    prune: z.boolean().optional(),
    keep: z
      .object({
        tokens: z.number().optional(),
      })
      .loose()
      .optional(),
    buffer: z.number().optional(),
  })
  .loose()

export const KnowledgeSettingsSchema = z
  .object({
    embeddingModel: z.string().optional(),
    chunkSize: z.number().int().positive().optional(),
    chunkOverlap: z.number().int().nonnegative().optional(),
  })
  .loose()

export const AgentSettingsSchema = z
  .object({
    model: z.string().optional(),
    provider: z.record(z.string(), AgentProviderEntrySchema).optional(),
    tools: AgentToolsSettingsSchema.optional(),
    permission: AgentPermissionSchema.optional(),
    compaction: AgentCompactionSchema.optional(),
    workspaceDir: z.string().optional(),
    systemPrompt: z.string().optional(),
    maxSteps: z.number().optional(),
  })
  .loose()

export const HuggingFaceSettingsSchema = z
  .object({
    remoteHost: z.string().optional(),
    cacheDir: z.string().optional(),
    allowRemoteModels: z.boolean().optional(),
  })
  .loose()

export const SettingsSchema = z
  .object({
    huggingface: HuggingFaceSettingsSchema.optional(),
    agent: AgentSettingsSchema.optional(),
    knowledge: KnowledgeSettingsSchema.optional(),
  })
  .loose()

export type SettingsSchemaType = z.infer<typeof SettingsSchema>
export type HuggingFaceSettingsSchemaType = z.infer<typeof HuggingFaceSettingsSchema>

export type AgentSettingsSchemaType = z.infer<typeof AgentSettingsSchema>
export type AgentToolsSettingsSchemaType = z.infer<typeof AgentToolsSettingsSchema>
export type AgentPermissionSchemaType = z.infer<typeof AgentPermissionSchema>
export type AgentPermissionAction = z.infer<typeof AgentPermissionActionSchema>
export type AgentCompactionSchemaType = z.infer<typeof AgentCompactionSchema>
export type KnowledgeSettingsSchemaType = z.infer<typeof KnowledgeSettingsSchema>
export type AgentProviderEntrySchemaType = z.infer<typeof AgentProviderEntrySchema>
export type AgentProviderOptionsSchemaType = z.infer<typeof AgentProviderOptionsSchema>
export type AgentProviderLimitSchemaType = z.infer<typeof AgentProviderLimitSchema>

export class Settings {
  private static queue: Promise<unknown> = Promise.resolve()

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private static get file(): string {
    return join(Path.root, "settings.json")
  }

  private static serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = Settings.queue.then(operation, operation)
    Settings.queue = run.catch(() => undefined)
    return run
  }

  static async read(): Promise<SettingsSchemaType> {
    const raw = await Bun.file(Settings.file).json().catch(() => undefined)
    const parsed = SettingsSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    return Settings.isRecord(raw) ? (raw as SettingsSchemaType) : {}
  }

  static update(patch: SettingsSchemaType): Promise<SettingsSchemaType> {
    return Settings.serialize(async () => {
      const merged = defu(patch, await Settings.read())
      await fs.outputJson(Settings.file, merged, { spaces: 2 })
      return merged
    })
  }

  static replace(settings: SettingsSchemaType): Promise<SettingsSchemaType> {
    return Settings.serialize(async () => {
      const parsed = SettingsSchema.safeParse(settings)
      const next = parsed.success ? parsed.data : settings
      await fs.outputJson(Settings.file, next, { spaces: 2 })
      return next
    })
  }
}
