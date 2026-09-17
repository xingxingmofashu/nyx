import { stat, readFile } from "node:fs/promises"
import { getModelsCatalogPath } from "@nyx/config"
import { lookupCatalogLimit, type CatalogLimit, type ModelsCatalog } from "@nyx/shared"

/**
 * Context-window lookup for the renderer: the desktop cannot import `@nyx/agent`
 * (ONNX + LanceDB), so it reads the same cached models.dev catalog the server
 * uses and applies the same provider/model lookup. Lets the context meter show
 * the real window from the first turn instead of waiting for the server to
 * report it back in message metadata.
 */

let cached: { catalog: ModelsCatalog; mtimeMs: number } | undefined

export async function readCatalogLimit(providerId: string, modelId: string): Promise<CatalogLimit | null> {
  if (!providerId || !modelId) return null
  const path = getModelsCatalogPath()
  try {
    const info = await stat(path)
    if (!cached || cached.mtimeMs !== info.mtimeMs) {
      cached = { catalog: JSON.parse(await readFile(path, "utf8")) as ModelsCatalog, mtimeMs: info.mtimeMs }
    }
  } catch {
    return null
  }
  return lookupCatalogLimit(cached.catalog, providerId, modelId) ?? null
}
