import * as baseModule from "./base.ts"
import * as chunkModule from "./chunker.ts"
import * as storeModule from "./store.ts"

export namespace Knowledge {
  export import Base = baseModule.Base
  export import Chunker = chunkModule.Chunker
  export import Store = storeModule.Store

  export import ConfigSchema = baseModule.ConfigSchema

  export type Chunk = chunkModule.Chunk
  export type SearchHit = storeModule.SearchHit
  export type ConfigSchemaType = baseModule.ConfigSchemaType
  export type Document = baseModule.Document
  export type DocumentStatus = baseModule.DocumentStatus
  export type DocumentImport = baseModule.DocumentImport
  export type ImportResult = baseModule.ImportResult
  export type IndexProgress = baseModule.IndexProgress
  export type IndexStats = baseModule.IndexStats
}
