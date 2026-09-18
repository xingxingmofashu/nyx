import { join } from "node:path"
import { defu } from "defu"
import fs from "fs-extra"
import { z } from "zod/v4"
import { Path } from "./path.ts"

export const ModelInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    task: z.string(),
    dtype: z.string().optional(),
    createdAt: z.string(),
  })
  .loose()

export const ModelsSchema = z
  .object({
    provider: z.record(
      z.string(),
      z.object({ models: z.record(z.string(), ModelInfoSchema) }),
    ),
  })
  .loose()

export type ModelInfoSchemaType = z.infer<typeof ModelInfoSchema>
export type ModelsSchemaType = z.infer<typeof ModelsSchema>

export class Models {
  private static get file(): string {
    return join(Path.root, "models.json")
  }

  static async read(): Promise<ModelsSchemaType> {
    const raw = await Bun.file(Models.file)
      .json()
      .catch(() => undefined)
    const parsed = ModelsSchema.safeParse(raw)
    return parsed.success ? parsed.data : { provider: {} }
  }

  static async register(entry: ModelsSchemaType): Promise<void> {
    const merged = defu(await Models.read(), entry)
    await fs.outputJson(Models.file, merged, { spaces: 2 })
  }

  static async unregister(modelId: string): Promise<void> {
    const data = await Models.read()
    let changed = false
    for (const [org, provider] of Object.entries(data.provider)) {
      for (const [name, info] of Object.entries(provider.models)) {
        if (info.id !== modelId) continue
        delete provider.models[name]
        changed = true
        break
      }
      if (Object.keys(provider.models).length === 0) delete data.provider[org]
      if (changed) break
    }
    if (changed) await fs.outputJson(Models.file, data, { spaces: 2 })
  }
}
