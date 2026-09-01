#!/usr/bin/env bun
/**
 * nyx CLI — local ONNX agent (no cloud).
 *
 *   nyx chat                 start a new session and chat (local model)
 *   nyx server               run the HTTP server
 *   nyx embed <text>         run a one-shot local ONNX embedding
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import pkg from "../package.json";
import { ChatCommand } from "./cli/commands/chat";
import { ServerCommand } from "./cli/commands/server";
import { EmbedCommand } from "./cli/commands/embed";

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("nyx")
  .wrap(yargs().terminalWidth())
  .help("help", "show help")
  .alias("h", ["help"])
  .version("version", pkg.version)
  .alias("v", ["version"])
  .command(ChatCommand)
  .command(ServerCommand)
  .command(EmbedCommand)
  .strict();

try {
  await cli.parse();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
}
// No process.exit() here: `chat` runs a long-lived REPL and `server` a
// long-lived HTTP server. Let the event loop keep them alive naturally.
