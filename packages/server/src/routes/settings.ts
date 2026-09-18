import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { Global } from "@nyx/global";
import { validationHook } from "../validation";

export function settings() {
  return new Hono()
    .get("/", async (c) => c.json(await Global.Settings.read()))
    .patch("/", zValidator("json", Global.SettingsSchema, validationHook), async (c) =>
      c.json(await Global.Settings.update(c.req.valid("json"))),
    )
    .put("/", zValidator("json", Global.SettingsSchema, validationHook), async (c) =>
      c.json(await Global.Settings.replace(c.req.valid("json"))),
    );
}
