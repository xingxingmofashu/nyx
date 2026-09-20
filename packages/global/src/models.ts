import { join } from "node:path"
import { defu } from "defu"
import fs from "fs-extra"
import { z } from "zod/v4"
import { Path } from "./path.ts"

export const MODEL_DTYPES = ["auto", "fp32", "fp16", "q8", "int8", "uint8", "q4", "bnb4", "q4f16"] as const
export const ModelDtypeSchema = z.enum(MODEL_DTYPES)
export type ModelDtype = z.infer<typeof ModelDtypeSchema>

export const ModelInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    task: z.string(),
    dtype: ModelDtypeSchema.optional(),
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
  private static queue: Promise<unknown> = Promise.resolve()

  private static get file(): string {
    return join(Path.root, "models.json")
  }

  private static serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = Models.queue.then(operation, operation)
    Models.queue = run.catch(() => undefined)
    return run
  }

  static async read(): Promise<ModelsSchemaType> {
    const raw = await Bun.file(Models.file)
      .json()
      .catch(() => undefined)
    const parsed = ModelsSchema.safeParse(raw)
    return parsed.success ? parsed.data : { provider: {} }
  }

  static register(entry: ModelsSchemaType): Promise<void> {
    return Models.serialize(async () => {
      const merged = defu(entry, await Models.read())
      await fs.outputJson(Models.file, merged, { spaces: 2 })
    })
  }

  static unregister(modelId: string): Promise<void> {
    return Models.serialize(async () => {
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
    })
  }
}
