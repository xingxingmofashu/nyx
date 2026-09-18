import { ipcMain, net } from "electron"
import { IPC } from "../../preload/ipc.ts"
import type { AgentProviderEntry, ProviderModels as ProviderModelsResult, Settings } from "../../renderer/src/types.ts"
import type { NyxServer } from "../server.ts"

export class Config {
  private static readonly PROVIDER_TIMEOUT_MS = 15_000
  private static readonly ANTHROPIC_VERSION = "2023-06-01"

  static register(server: NyxServer): void {
    ipcMain.handle(IPC.config.getSettings, () => server.settings())
    ipcMain.handle(IPC.config.setSettings, (_e, patch: Settings) => server.updateSettings(patch))
    ipcMain.handle(IPC.config.writeSettings, (_e, settings: Settings) => server.replaceSettings(settings))
    ipcMain.handle(IPC.config.listModels, (_e, provider: AgentProviderEntry) => Config.listProviderModels(provider))
    ipcMain.handle(IPC.config.restartServer, async () => {
      await server.stop()
      await server.start()
    })
  }

  private static async listProviderModels(provider: AgentProviderEntry): Promise<ProviderModelsResult> {
    const options = provider.options ?? {}
    const defaultBase = provider.npm === "@ai-sdk/anthropic" ? "https://api.anthropic.com/v1" : undefined
    const baseURL = options.baseURL ?? defaultBase
    const base = provider.modelsUrl ?? (baseURL ? `${baseURL.replace(/\/$/, "")}/models` : undefined)
    if (!base) {
      return { ids: [], error: "Set a base URL or models URL first." }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "nyx/0.1",
      ...options.headers,
    }
    if (provider.npm === "@ai-sdk/anthropic") {
      if (options.apiKey) headers["x-api-key"] = options.apiKey
      headers["anthropic-version"] ??= Config.ANTHROPIC_VERSION
    } else if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`
    }

    try {
      const res = await net.fetch(base, { headers, signal: AbortSignal.timeout(Config.PROVIDER_TIMEOUT_MS) })
      if (!res.ok) return { ids: [], error: `HTTP ${res.status} ${res.statusText}` }
      return { ids: Config.extractModelIds(await res.json()) }
    } catch (error) {
      return { ids: [], error: error instanceof Error ? error.message : String(error) }
    }
  }

  private static extractModelIds(body: unknown): string[] {
    const list = Array.isArray(body)
      ? body
      : typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data)
        ? ((body as { data: unknown[] }).data)
        : []
    const ids: string[] = []
    for (const item of list) {
      const id = typeof item === "string" ? item : (item as { id?: unknown } | null)?.id
      if (typeof id === "string" && id) ids.push(id)
    }
    return ids
  }
}
