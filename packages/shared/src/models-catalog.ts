/** Per-model limits as the models.dev catalog reports them. */
export interface CatalogLimit {
  context?: number;
  input?: number;
  output?: number;
}

/** The slice of the models.dev catalog this repo needs. */
export type ModelsCatalog = Record<string, { models?: Record<string, { limit?: CatalogLimit }> } | undefined>;

/**
 * Look up a model's limits in the catalog. The provider id in a user's settings
 * does not always match the catalog's (e.g. `opencode` vs `opencode-go`), so an
 * exact provider match is tried first and then the model id is matched anywhere
 * in the catalog. Returns undefined when the model is unknown.
 */
export function lookupCatalogLimit(
  catalog: ModelsCatalog | undefined,
  providerId: string,
  modelId: string,
): CatalogLimit | undefined {
  if (!catalog || !modelId) return undefined;
  const direct = catalog[providerId]?.models?.[modelId]?.limit;
  if (direct) return direct;

  const wanted = modelId.toLowerCase();
  for (const provider of Object.values(catalog)) {
    for (const [id, model] of Object.entries(provider?.models ?? {})) {
      if (id.toLowerCase() === wanted && model.limit) return model.limit;
    }
  }
  return undefined;
}
