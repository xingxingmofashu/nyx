#!/usr/bin/env bun
/**
 * nyx CLI — local ONNX agent (no cloud).
 *
 *   nyx                     run the interactive chat TUI (default)
 *   nyx chat --message "你好"   one-shot local chat
 *   nyx tui                 run the interactive chat TUI
 *   nyx server              run the HTTP server
 *   nyx embed <text>        run a one-shot local ONNX embedding
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import pkg from "../package.json";
import { ChatCommand } from "./cli/commands/chat";
import { TuiCommand } from "./cli/commands/tui";
import { ServerCommand } from "./cli/commands/server";
import { EmbedCommand } from "./cli/commands/embed";
import { buildEngine } from "./cli/utils/engine";
import { run } from "./tui";
import { isatty } from "node:tty";

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("nyx")
  .wrap(yargs().terminalWidth())
  .help("help", "show help")
  .alias("h", ["help"])
  .version("version", pkg.version)
  .alias("v", ["version"])
  .command(ChatCommand)
  .command(TuiCommand)
  .command(ServerCommand)
  .command(EmbedCommand)
  .strict();

try {
  const argv = await cli.parse();

  // No subcommand given: default to the interactive TUI.
  if (argv._.length === 0) {
    if (!isatty(process.stdin.fd)) {
      console.error(
        "nyx: interactive mode needs a terminal. " +
          "Use `nyx chat --message <text>` for one-shot output.",
      );
      process.exit(1);
    }
    const engine = buildEngine();
    await run({ agent: engine.agent, model: engine.llm.model });
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
}
// No process.exit() here: `tui`/`server` run long-lived loops. Let the event
// loop keep them alive naturally.
