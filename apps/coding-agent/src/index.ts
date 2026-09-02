#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import pkg from "../package.json";
import { TextGenerationCommand } from "./cli/commands/tasks/text-generation";
import { TuiCommand } from "./cli/commands/tui";
import { ServerCommand } from "./cli/commands/server";
import { ImageToImageCommand } from "./cli/commands/tasks/image-to-image";
import { Agent } from "@nyx/core";
import { OnnxTextGenerationProvider } from "@nyx/llm";
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
  .command(TextGenerationCommand)
  .command(TuiCommand)
  .command(ServerCommand)
  .command(ImageToImageCommand)
  .strict();

try {
  const argv = await cli.parse();

  if (argv._.length === 0) {
    if (!isatty(process.stdin.fd)) {
      console.error(
        "nyx: interactive mode needs a terminal. " +
          "Use `nyx text-generation --message <text>` for one-shot output.",
      );
      process.exit(1);
    }
    const llm = new OnnxTextGenerationProvider();
    await run({ agent: new Agent({ llm }), model: llm.model });
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
}
