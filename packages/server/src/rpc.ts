import type { createApp } from "./app"

/**
 * Type-only entry for the Hono RPC client. Import as `import type { AppType }
 * from "@nyx/server/rpc"` so no server runtime (onnx, transformers) is bundled
 * into the consumer.
 */
export type AppType = ReturnType<typeof createApp>
