import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { auth } from "./middleware/auth"
import { agent } from "./routes/agent"
import { automaticSpeechRecognition } from "./routes/automatic-speech-recognition"
import { imageToImage } from "./routes/image-to-image"
import { models } from "./routes/models"
import { textToSpeech } from "./routes/text-to-speech"
import { AgentService } from "./services/agent"
import { AutomaticSpeechRecognitionService } from "./services/tasks/automatic-speech-recognition"
import { ImageToImageService } from "./services/tasks/image-to-image"
import { KnowledgeService } from "./services/knowledge"
import { ModelsService } from "./services/models"
import { TextToSpeechService } from "./services/tasks/text-to-speech"
import { ProviderCache } from "./provider/cache"

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
  /** Runs the remote master-brain agent loop. */
  agent: AgentService
}

/** No-op used when the server is started without a token (CLI in-process). */
const noopAuth: MiddlewareHandler = async (_c, next) => {
  await next()
}

/**
 * Assemble a fully-wired app: mount services under `/v1`. The return type is
 * intentionally inferred so `@nyx/server/api` can expose it to the Hono RPC client.
 */
export function createApp(options: { token?: string; services?: ServerServices; onLog?: (message: string) => void } = {}) {
  // Share one provider cache between the task services and the model service so
  // removing a model also evicts its loaded weights.
  const cache = new ProviderCache()
  const knowledgeService = new KnowledgeService(options.onLog)
  const services: ServerServices = options.services ?? {
    models: new ModelsService(cache),
    imageToImage: new ImageToImageService(cache),
    textToSpeech: new TextToSpeechService(cache),
    automaticSpeechRecognition: new AutomaticSpeechRecognitionService(cache),
    knowledge: knowledgeService,
    agent: new AgentService(cache, knowledgeService),
  }

  // Index the knowledge dir in the background on startup (both the CLI `start()`
  // and the spawned desktop binary go through here). No-op when the dir has no
  // Markdown files, or the embedding model isn't downloaded.
  if (!options.services) void services.knowledge.ensureIndexed().catch(() => {})

  const handle = options.token ? auth(options.token) : noopAuth

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

  return new Hono().route("/v1", v1)
}
