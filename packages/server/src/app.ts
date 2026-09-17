import { Hono } from "hono"
import {
  AgentService,
  AutomaticSpeechRecognitionService,
  ensureModelsCatalog,
  ImageToImageService,
  KnowledgeService,
  ModelsService,
  Provider,
  TextToSpeechService,
} from "@nyx/agent"
import { auth } from "./middleware/auth"
import { agent } from "./routes/agent"
import { automaticSpeechRecognition } from "./routes/automatic-speech-recognition"
import { imageToImage } from "./routes/image-to-image"
import { knowledge } from "./routes/knowledge"
import { models } from "./routes/models"
import { textToSpeech } from "./routes/text-to-speech"

/** Service dependencies shared by every route, wired once per app instance. */
export interface ServerServices {
  /** Downloads/removes models: list, pull, cancel, remove. */
  models: ModelsService
  /** Runs image-to-image transforms. */
  imageToImage: ImageToImageService
  /** Synthesizes speech from text. */
  textToSpeech: TextToSpeechService
  /** Transcribes speech into text. */
  automaticSpeechRecognition: AutomaticSpeechRecognitionService
  /** Manages and searches the local knowledge base (RAG). */
  knowledge: KnowledgeService
  /** Runs the agent loop against the remote model. */
  agent: AgentService
}

/**
 * Assemble a fully-wired app: mount services under `/v1`. The return type is
 * intentionally inferred so `@nyx/server/api` can expose it to the Hono RPC client.
 */
export function createApp(options: { token: string; onLog: (message: string) => void }) {
  // Share one provider cache between the task services and the model service so
  // removing a model also evicts its loaded weights.
  const cache = new Provider()
  const knowledgeService = new KnowledgeService(options.onLog)
  const services: ServerServices = {
    models: new ModelsService(cache),
    imageToImage: new ImageToImageService(cache),
    textToSpeech: new TextToSpeechService(cache),
    automaticSpeechRecognition: new AutomaticSpeechRecognitionService(cache),
    knowledge: knowledgeService,
    agent: new AgentService(cache, knowledgeService),
  }

  // The knowledge index is not built here on purpose: opening the app should
  // not start an embedding pass. Only the desktop's Knowledge page starts one
  // (Update index / Rebuild); `search_knowledge` reports an empty index instead
  // of filling it.

  // Model limits (context window) for the agent's context compaction: cached in
  // ~/.nyx/cache, refreshed in the background. No-op when it is already fresh.
  void ensureModelsCatalog().catch(() => {})

  const handle = auth(options.token)

  const v1 = new Hono()
    .use("*", handle)
    .get("/health", (c) => c.json({ ok: true }))
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
