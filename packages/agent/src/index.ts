import * as attachmentModule from "./attachment.ts"
import * as compactionModule from "./compaction.ts"
import * as loopModule from "./loop.ts"
import * as providerModule from "./provider.ts"
import * as sessionModule from "./session.ts"
import * as workspaceModule from "./workspace.ts"
import * as agentServiceModule from "./services/agent.ts"
import * as knowledgeServiceModule from "./services/knowledge.ts"
import * as modelsServiceModule from "./services/models.ts"
import * as automaticSpeechRecognitionServiceModule from "./services/tasks/automatic-speech-recognition.ts"
import * as imageToImageServiceModule from "./services/tasks/image-to-image.ts"
import * as textToSpeechServiceModule from "./services/tasks/text-to-speech.ts"
import * as bashToolModule from "./tools/bash.ts"
import * as editToolModule from "./tools/edit.ts"
import * as globToolModule from "./tools/glob.ts"
import * as grepToolModule from "./tools/grep.ts"
import * as localImageToImageToolModule from "./tools/local-image-to-image.ts"
import * as localTextToSpeechToolModule from "./tools/local-text-to-speech.ts"
import * as readToolModule from "./tools/read.ts"
import * as searchKnowledgeToolModule from "./tools/search-knowledge.ts"
import * as webFetchToolModule from "./tools/webfetch.ts"
import * as webSearchToolModule from "./tools/websearch.ts"
import * as writeToolModule from "./tools/write.ts"

export namespace Agent {
  export import Attachment = attachmentModule.Attachment
  export import Compaction = compactionModule.Compaction
  export import Loop = loopModule.Loop
  export import Provider = providerModule.Provider
  export import Workspace = workspaceModule.Workspace

  export namespace Tools {
    export import Bash = bashToolModule.Bash
    export import Edit = editToolModule.Edit
    export import Glob = globToolModule.Glob
    export import Grep = grepToolModule.Grep
    export import LocalImageToImage = localImageToImageToolModule.LocalImageToImage
    export import LocalTextToSpeech = localTextToSpeechToolModule.LocalTextToSpeech
    export import Read = readToolModule.Read
    export import SearchKnowledge = searchKnowledgeToolModule.SearchKnowledge
    export import WebFetch = webFetchToolModule.WebFetch
    export import WebSearch = webSearchToolModule.WebSearch
    export import Write = writeToolModule.Write

    export type ImageToImageToolOptions = localImageToImageToolModule.ImageToImageToolOptions
    export type TextToSpeechToolOptions = localTextToSpeechToolModule.TextToSpeechToolOptions
    export type WebSearchProvider = webSearchToolModule.WebSearchProvider
    export type WebSearchToolsOptions = webSearchToolModule.WebSearchToolsOptions
  }

  export namespace Services {
    export import Agent = agentServiceModule.Agent
    export import Knowledge = knowledgeServiceModule.Knowledge
    export import Models = modelsServiceModule.Models
    export import AutomaticSpeechRecognition = automaticSpeechRecognitionServiceModule.AutomaticSpeechRecognition
    export import ImageToImage = imageToImageServiceModule.ImageToImage
    export import TextToSpeech = textToSpeechServiceModule.TextToSpeech

    export import AgentOptionsSchema = agentServiceModule.AgentOptionsSchema
    export import AgentRequestSchema = agentServiceModule.AgentRequestSchema
    export import CompactRequestSchema = agentServiceModule.CompactRequestSchema
    export type AgentOptions = agentServiceModule.AgentOptions
    export type AgentRequestInput = agentServiceModule.AgentRequestInput
    export type AgentRequest = agentServiceModule.AgentRequest
    export type CompactRequestInput = agentServiceModule.CompactRequestInput
    export type CompactRequest = agentServiceModule.CompactRequest
    export type CompactResponse = agentServiceModule.CompactResponse

    export import ModelPullRequestSchema = modelsServiceModule.ModelPullRequestSchema
    export import ModelIdRequestSchema = modelsServiceModule.ModelIdRequestSchema
    export type ModelInfo = modelsServiceModule.ModelInfo
    export type ModelPullRequest = modelsServiceModule.ModelPullRequest
    export type ModelIdRequest = modelsServiceModule.ModelIdRequest

    export import ImageBase64InputSchema = imageToImageServiceModule.ImageBase64InputSchema
    export import ImageToImageRequestSchema = imageToImageServiceModule.ImageToImageRequestSchema
    export type ImageBase64Input = imageToImageServiceModule.ImageBase64Input
    export type ImageToImageRequest = imageToImageServiceModule.ImageToImageRequest
    export type ImageBytes = imageToImageServiceModule.ImageBytes
    export type ImageResult = imageToImageServiceModule.ImageResult
    export type GeneratedImage = imageToImageServiceModule.GeneratedImage

    export import TextToSpeechInputSchema = textToSpeechServiceModule.TextToSpeechInputSchema
    export import TextToSpeechRequestSchema = textToSpeechServiceModule.TextToSpeechRequestSchema
    export type TextToSpeechInput = textToSpeechServiceModule.TextToSpeechInput
    export type TextToSpeechRequest = textToSpeechServiceModule.TextToSpeechRequest
    export type AudioResult = textToSpeechServiceModule.AudioResult
    export type GeneratedAudio = textToSpeechServiceModule.GeneratedAudio

    export import AutomaticSpeechRecognitionInputSchema =
      automaticSpeechRecognitionServiceModule.AutomaticSpeechRecognitionInputSchema
    export import AutomaticSpeechRecognitionRequestSchema =
      automaticSpeechRecognitionServiceModule.AutomaticSpeechRecognitionRequestSchema
    export type AudioSamples = automaticSpeechRecognitionServiceModule.AudioSamples
    export type AutomaticSpeechRecognitionInput =
      automaticSpeechRecognitionServiceModule.AutomaticSpeechRecognitionInput
    export type AutomaticSpeechRecognitionRequest =
      automaticSpeechRecognitionServiceModule.AutomaticSpeechRecognitionRequest
    export type TranscriptResult = automaticSpeechRecognitionServiceModule.TranscriptResult

    export import KnowledgeDocumentInputSchema = knowledgeServiceModule.KnowledgeDocumentInputSchema
    export import KnowledgeImportRequestSchema = knowledgeServiceModule.KnowledgeImportRequestSchema
    export import KnowledgeDeleteRequestSchema = knowledgeServiceModule.KnowledgeDeleteRequestSchema
    export import KnowledgeReadQuerySchema = knowledgeServiceModule.KnowledgeReadQuerySchema
    export import KnowledgeIndexRequestSchema = knowledgeServiceModule.KnowledgeIndexRequestSchema
    export import KnowledgeSearchRequestSchema = knowledgeServiceModule.KnowledgeSearchRequestSchema
    export type KnowledgeSearchHit = knowledgeServiceModule.KnowledgeSearchHit
    export type KnowledgeDocumentStatus = knowledgeServiceModule.KnowledgeDocumentStatus
    export type KnowledgeDocument = knowledgeServiceModule.KnowledgeDocument
    export type KnowledgeStatus = knowledgeServiceModule.KnowledgeStatus
    export type KnowledgeDocumentInput = knowledgeServiceModule.KnowledgeDocumentInput
    export type KnowledgeImportRequestInput = knowledgeServiceModule.KnowledgeImportRequestInput
    export type KnowledgeImportResult = knowledgeServiceModule.KnowledgeImportResult
    export type KnowledgeDeleteRequestInput = knowledgeServiceModule.KnowledgeDeleteRequestInput
    export type KnowledgeReadQueryInput = knowledgeServiceModule.KnowledgeReadQueryInput
    export type KnowledgeIndexRequestInput = knowledgeServiceModule.KnowledgeIndexRequestInput
    export type KnowledgeSearchRequestInput = knowledgeServiceModule.KnowledgeSearchRequestInput
    export type KnowledgeIndexProgress = knowledgeServiceModule.KnowledgeIndexProgress
  }

  export type ResolvedModel = providerModule.ResolvedModel
  export type RunOptions = loopModule.RunOptions
  export type TokenUsage = compactionModule.TokenUsage
  export type ContextCheckpoint = compactionModule.ContextCheckpoint
  export type CompactionPolicy = compactionModule.CompactionPolicy
  export type CompactionOptions = compactionModule.CompactionOptions
  export type CompactionResult = compactionModule.CompactionResult
  export type UIMessage = import("ai").UIMessage
  export type UIMessageChunk = import("ai").UIMessageChunk

  export import SessionIdSchema = sessionModule.SessionIdSchema
  export import WorkspaceQuerySchema = sessionModule.WorkspaceQuerySchema
  export import SessionSaveRequestSchema = sessionModule.SessionSaveRequestSchema
  export import SessionPatchRequestSchema = sessionModule.SessionPatchRequestSchema
  export import ActiveSessionRequestSchema = sessionModule.ActiveSessionRequestSchema
  export type ChatSession = sessionModule.ChatSession
  export type ChatSessionMeta = sessionModule.ChatSessionMeta
  export type SessionSaveRequest = sessionModule.SessionSaveRequest
  export type SessionPatchRequest = sessionModule.SessionPatchRequest
  export type ActiveSessionRequest = sessionModule.ActiveSessionRequest

  export import GeneratedFileQuerySchema = attachmentModule.GeneratedFileQuerySchema
  export import AttachmentSaveRequestSchema = attachmentModule.AttachmentSaveRequestSchema
  export type SavedAttachment = attachmentModule.SavedAttachment
  export type GeneratedFileQuery = attachmentModule.GeneratedFileQuery
  export type AttachmentSaveRequest = attachmentModule.AttachmentSaveRequest
  export type ChatMessageMetadata = attachmentModule.ChatMessageMetadata
}
