import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { AttachmentSaveRequestSchema, GeneratedFileQuerySchema } from "@nyx/agent/schema";
import { readGeneratedFileDataUrl, saveAttachment } from "../files";
import { validationHook } from "../validation";

export function files() {
  return new Hono()
    .get("/data-url", zValidator("query", GeneratedFileQuerySchema, validationHook), async (c) => {
      const { path, workspaceDir } = c.req.valid("query");
      return c.json({ dataUrl: await readGeneratedFileDataUrl(path, workspaceDir) });
    })
    .post("/attachments", zValidator("json", AttachmentSaveRequestSchema, validationHook), async (c) => {
      try {
        return c.json(await saveAttachment(c.req.valid("json")));
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    });
}
