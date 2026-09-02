#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { log } from "@clack/prompts";
import pkg from "../package.json";
import { TuiCommand } from "./cli/commands/tui";
import { TextGenerationCommand } from "./cli/commands/tasks/text-generation";
import { ImageToImageCommand } from "./cli/commands/tasks/image-to-image";
import { ModelCommand } from "./cli/commands/model";

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("nyx")
  .wrap(yargs().terminalWidth())
  .help("help", "show help")
  .alias("h", ["help"])
  .version("version", pkg.version)
  .alias("v", ["version"])
  .command(TuiCommand)
  .command(TextGenerationCommand)
  .command(ImageToImageCommand)
  .command(ModelCommand)
  .strict();

try {
  await cli.parse();
} catch (error) {
  if (error instanceof Error) {
    log.error(error.message);
  }
  process.exitCode = 1;
}
