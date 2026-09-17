import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { lookupCatalogLimit, type CatalogLimit, type ModelsCatalog } from "@nyx/shared";
import { getModelsCatalogPath } from "@nyx/config";

/**
 * The models.dev catalog: model metadata (notably the context window) for
 * hundreds of providers. Mirrors opencode's approach — fetch once, cache on
 * disk with a TTL, refresh in the background, and degrade gracefully when the
 * network is unavailable. The provider-config `limit` always wins over the
 * catalog, and an unknown model simply has no limit.
 *
 * Source: `NYX_MODELS_URL` (default `https://models.dev/api.json`). Cache:
 * `~/.nyx/cache/models.json`. Set `NYX_DISABLE_MODELS_FETCH=1` to stay offline.
 */

export type { CatalogLimit };

const DEFAULT_URL = "https://models.dev/api.json";
const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

let catalog: ModelsCatalog | undefined;
let loadedAt = 0;
let loadedFromDisk: Promise<void> | undefined;
let refreshing: Promise<void> | undefined;

function sourceUrl(): string {
  return process.env.NYX_MODELS_URL ?? DEFAULT_URL;
}

function cachePath(): string {
  return getModelsCatalogPath();
}

/** Read and parse the on-disk cache; undefined when missing or invalid. */
async function readCache(): Promise<{ catalog: ModelsCatalog; mtime: number } | undefined> {
  const path = cachePath();
  try {
    const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return { catalog: parsed as ModelsCatalog, mtime: info.mtimeMs };
  } catch {
    return undefined;
  }
}

async function fetchCatalog(): Promise<{ catalog: ModelsCatalog; text: string } | undefined> {
  try {
    const response = await fetch(sourceUrl(), {
      headers: { Accept: "application/json", "User-Agent": "nyx/0.1" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return { catalog: parsed as ModelsCatalog, text };
  } catch {
    return undefined;
  }
}

async function persistCatalog(text: string): Promise<void> {
  const path = cachePath();
  const temp = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temp, text, "utf8");
  await rename(temp, path);
}

/**
 * Load the catalog into memory. The on-disk cache is read before this resolves
 * (so a caller can await it and still look a model up right away); the network
 * refresh runs in the background unless `force` is set. A failed refresh backs
 * off for one TTL instead of retrying on every turn, and concurrent refreshes
 * are shared.
 */
export async function ensureModelsCatalog(force = false): Promise<void> {
  if (loadedFromDisk === undefined) {
    loadedFromDisk = (async () => {
      const cached = await readCache();
      if (cached) {
        catalog = cached.catalog;
        loadedAt = cached.mtime;
      }
    })();
  }
  await loadedFromDisk;

  const stale = loadedAt === 0 || Date.now() - loadedAt >= TTL_MS;
  if (!stale && !force) return;
  if (process.env.NYX_DISABLE_MODELS_FETCH === "1") return;
  if (refreshing === undefined) {
    refreshing = refresh().finally(() => {
      refreshing = undefined;
    });
  }
  if (force) await refreshing;
}

/** Fetch the catalog and persist it; advances `loadedAt` either way so a failure backs off. */
async function refresh(): Promise<void> {
  const fetched = await fetchCatalog();
  if (fetched) {
    catalog = fetched.catalog;
    await persistCatalog(fetched.text).catch(() => undefined);
  }
  loadedAt = Date.now();
}

/** Look up a model's limits in the loaded catalog (see `lookupCatalogLimit`). */
export function lookupModelLimit(providerId: string, modelId: string): CatalogLimit | undefined {
  return lookupCatalogLimit(catalog, providerId, modelId);
}
