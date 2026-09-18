import { Hono } from "hono";
import { Global } from "@nyx/global";

export function environment() {
  return new Hono().get("/", (c) =>
    c.json({ modelsDir: Global.Path.models, knowledgeDir: Global.Path.knowledge }),
  );
}
