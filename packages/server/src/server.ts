/**
 * nyx local server — minimal HTTP boundary.
 *
 * v1 exposes just three endpoints: health, chat (local ONNX LLM), and embed
 * (local ONNX embeddings). No sessions, tools, or permissions yet.
 *
 * Routes:
 *   GET  /api/health
 *   POST /api/chat     { message } -> { text }
 *   POST /api/embed    { texts }   -> number[][]
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Agent } from "@nyx/core";
import type { OnnxEmbeddingEngine } from "@nyx/llm";

export interface ServerOptions {
  agent: Agent;
  embedder: OnnxEmbeddingEngine;
  port?: number;
  host?: string;
}

interface ServerContext {
  agent: Agent;
  embedder: OnnxEmbeddingEngine;
}

export class NyxServer {
  private ctx: ServerContext;
  private port: number;
  private host: string;
  private server: ReturnType<typeof serve> | null = null;
  private app: Hono;

  constructor(options: ServerOptions) {
    this.ctx = {
      agent: options.agent,
      embedder: options.embedder,
    };
    this.port = options.port ?? 3848;
    this.host = options.host ?? "127.0.0.1";
    this.app = new Hono();
    this.routes();
  }

  get url(): string {
    return `http://${this.host}:${this.port}`;
  }

  async start(): Promise<void> {
    this.server = serve({ fetch: this.app.fetch, port: this.port, hostname: this.host });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
      if (!this.server) resolve();
    });
    this.server = null;
  }

  private routes(): void {
    const { app, ctx } = this;

    app.use("*", async (c, next) => {
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type");
      if (c.req.method === "OPTIONS") return c.body(null, 204);
      await next();
    });

    app.get("/api/health", (c) => c.json({ ok: true, version: "0.1.0" }));

    // --- Chat (local ONNX LLM) ---
    app.post("/api/chat", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const message = (body as { message?: string }).message;
      if (!message) return c.json({ error: "message is required" }, 400);
      const result = await ctx.agent.prompt(message);
      return c.json(result);
    });

    // --- Embed (local ONNX) ---
    app.post("/api/embed", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const texts = (body as { texts?: string[] }).texts;
      if (!texts || !Array.isArray(texts)) {
        return c.json({ error: "texts[] is required" }, 400);
      }
      const results = await ctx.embedder.embedMany(texts);
      return c.json(results.map((r) => r.vector));
    });
  }
}
