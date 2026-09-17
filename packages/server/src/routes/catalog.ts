import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CatalogLimitQuerySchema } from "@nyx/agent/schema";
import { ensureModelsCatalog, lookupModelLimit } from "@nyx/agent";
import { validationHook } from "../validation";

export function catalog() {
  return new Hono().get(
    "/limit",
    zValidator("query", CatalogLimitQuerySchema, validationHook),
    async (c) => {
      const { provider, model } = c.req.valid("query");
      await ensureModelsCatalog();
      return c.json(lookupModelLimit(provider, model) ?? null);
    },
  );
}
