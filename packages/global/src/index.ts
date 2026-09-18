import * as modelsModule from "./models.ts"
import * as pathModule from "./path.ts"
import * as sessionModule from "./session.ts"
import * as settingsModule from "./settings.ts"
import * as workspaceModule from "./workspace.ts"

export namespace Global {
  export import Path = pathModule.Path
  export import Workspace = workspaceModule.Workspace
  export import Settings = settingsModule.Settings
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
  export import ChatSessionMetaSchema = sessionModule.ChatSessionMetaSchema
  export import ChatSessionSchema = sessionModule.ChatSessionSchema

  export type SettingsSchemaType = settingsModule.SettingsSchemaType
  export type AgentSettingsSchemaType = settingsModule.AgentSettingsSchemaType
  export type AgentToolsSettingsSchemaType = settingsModule.AgentToolsSettingsSchemaType
  export type AgentCompactionSchemaType = settingsModule.AgentCompactionSchemaType
  export type KnowledgeSettingsSchemaType = settingsModule.KnowledgeSettingsSchemaType
  export type AgentProviderEntrySchemaType = settingsModule.AgentProviderEntrySchemaType
  export type AgentProviderOptionsSchemaType = settingsModule.AgentProviderOptionsSchemaType
  export type AgentProviderLimitSchemaType = settingsModule.AgentProviderLimitSchemaType
  export type ModelInfoSchemaType = modelsModule.ModelInfoSchemaType
  export type ModelsSchemaType = modelsModule.ModelsSchemaType
  export type ChatSession = sessionModule.ChatSession
  export type ChatSessionMeta = sessionModule.ChatSessionMeta
  export type SessionSaveInput = sessionModule.SessionSaveInput
}
