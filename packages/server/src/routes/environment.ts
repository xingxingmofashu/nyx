import { Hono } from "hono";
import { Global } from "@nyx/global";
import type { AppEnvironment } from "@nyx/agent/schema";

export function environment() {
  return new Hono().get("/", (c) => {
    const body: AppEnvironment = {
      modelsDir: Global.Path.models,
      knowledgeDir: Global.Path.knowledge,
    };
    return c.json(body);
  });
}
