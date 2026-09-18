import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { Global } from "@nyx/global"
import { Errors } from "../errors.ts"

export class Settings {
  static create() {
    return new Hono()
      .get("/", async (c) => c.json(await Global.Settings.read()))
      .patch("/", zValidator("json", Global.SettingsSchema, Errors.hook), async (c) =>
        c.json(await Global.Settings.update(c.req.valid("json"))),
      )
      .put("/", zValidator("json", Global.SettingsSchema, Errors.hook), async (c) =>
        c.json(await Global.Settings.replace(c.req.valid("json"))),
      )
  }
}
