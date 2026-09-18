import { Hono } from "hono"
import { Agent } from "@nyx/agent"
import { auth } from "./middleware/auth"
import { agent } from "./routes/agent"
import { automaticSpeechRecognition } from "./routes/automatic-speech-recognition"
import { environment } from "./routes/environment"
import { files } from "./routes/files"
import { imageToImage } from "./routes/image-to-image"
import { knowledge } from "./routes/knowledge"
import { models } from "./routes/models"
import { sessions } from "./routes/sessions"
import { settings } from "./routes/settings"
import { textToSpeech } from "./routes/text-to-speech"

/** Service dependencies shared by every route, wired once per app instance. */
export interface ServerServices {
  /** Downloads/removes models: list, pull, cancel, remove. */
  models: Agent.Services.Models
  /** Runs image-to-image transforms. */
  imageToImage: Agent.Services.ImageToImage
  /** Synthesizes speech from text. */
  textToSpeech: Agent.Services.TextToSpeech
  /** Transcribes speech into text. */
  automaticSpeechRecognition: Agent.Services.AutomaticSpeechRecognition
  /** Manages and searches the local knowledge base (RAG). */
  knowledge: Agent.Services.Knowledge
  /** Runs the agent loop against the remote model. */
  agent: Agent.Services.Agent
}

/**
 * Assemble a fully-wired app: mount services under `/v1`. The return type is
 * intentionally inferred so `@nyx/server/api` can expose it to the Hono RPC client.
 */
export function createApp(options: { token: string; onLog: (message: string) => void }) {
  // Share one provider cache between the task services and the model service so
  // removing a model also evicts its loaded weights.
  const cache = new Agent.Provider()
  const knowledgeService = new Agent.Services.Knowledge(options.onLog)
  const services: ServerServices = {
    models: new Agent.Services.Models(cache),
    imageToImage: new Agent.Services.ImageToImage(cache),
    textToSpeech: new Agent.Services.TextToSpeech(cache),
    automaticSpeechRecognition: new Agent.Services.AutomaticSpeechRecognition(cache),
    knowledge: knowledgeService,
    agent: new Agent.Services.Agent(cache, knowledgeService),
  }

  // The knowledge index is not built here on purpose: opening the app should
  // not start an embedding pass. Only the desktop's Knowledge page starts one
  // (Update index / Rebuild); `search_knowledge` reports an empty index instead
  // of filling it.

  const handle = auth(options.token)

  const v1 = new Hono()
    .use("*", handle)
    .get("/health", (c) => c.json({ ok: true }))
    .route("/settings", settings())
    .route("/environment", environment())
    .route("/sessions", sessions())
    .route("/files", files())
    .route("/models", models(services.models))
    .route("/tasks/image-to-image", imageToImage(services.imageToImage))
    .route("/tasks/text-to-speech", textToSpeech(services.textToSpeech))
    .route(
      "/tasks/automatic-speech-recognition",
      automaticSpeechRecognition(services.automaticSpeechRecognition),
    )
    .route("/agent", agent(services.agent))
    .route("/knowledge", knowledge(services.knowledge))

  return new Hono().route("/v1", v1)
}
