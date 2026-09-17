import * as modelsModule from "./models.ts"
import * as pathModule from "./path.ts"
import * as sessionModule from "./session.ts"
import * as settingsModule from "./settings.ts"
import * as workspaceModule from "./workspace.ts"

export namespace Global {
  export import Path = pathModule.Path
  export import Workspace = workspaceModule.Workspace

  export import Settings = settingsModule.Settings
  export import DEFAULT_HUB_URL = settingsModule.DEFAULT_HUB_URL

  export import Models = modelsModule.Models

  export import Session = sessionModule.Session

  export import SettingsSchema = settingsModule.SettingsSchema
  export import AgentSettingsSchema = settingsModule.AgentSettingsSchema
  export import AgentProviderEntrySchema = settingsModule.AgentProviderEntrySchema
  export import AgentProviderOptionsSchema = settingsModule.AgentProviderOptionsSchema
  export import AgentProviderLimitSchema = settingsModule.AgentProviderLimitSchema
  export import AgentToolsSettingsSchema = settingsModule.AgentToolsSettingsSchema
  export import AgentCompactionSchema = settingsModule.AgentCompactionSchema
  export import KnowledgeSettingsSchema = settingsModule.KnowledgeSettingsSchema
  export import ModelInfoSchema = modelsModule.ModelInfoSchema
  export import ModelsSchema = modelsModule.ModelsSchema

  export type AgentSettings = settingsModule.AgentSettings
  export type AgentToolsSettings = settingsModule.AgentToolsSettings
  export type AgentCompactionSettings = settingsModule.AgentCompactionSettings
  export type KnowledgeSettings = settingsModule.KnowledgeSettings
  export type AgentProviderEntry = settingsModule.AgentProviderEntry
  export type AgentProviderOptions = settingsModule.AgentProviderOptions
  export type AgentProviderLimit = settingsModule.AgentProviderLimit
  export type ModelInfo = modelsModule.ModelInfo
  export type ModelsData = modelsModule.ModelsData
  export type ChatSession = sessionModule.ChatSession
  export type ChatSessionMeta = sessionModule.ChatSessionMeta
  export type SessionSaveInput = sessionModule.SessionSaveInput
}
