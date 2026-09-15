#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { log } from "@clack/prompts";
import pkg from "../package.json";
import { AgentCommand } from "./cli/cmd/agent";
import { ImageToImageCommand } from "./cli/cmd/tasks/image-to-image";
import { TextToSpeechCommand } from "./cli/cmd/tasks/text-to-speech";
import { ModelCommand } from "./cli/cmd/model";

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("nyx")
  .wrap(yargs().terminalWidth())
  .help("help", "show help")
  .alias("h", ["help"])
  .version("version", pkg.version)
  .alias("v", ["version"])
  .command(AgentCommand)
  .command(ImageToImageCommand)
  .command(TextToSpeechCommand)
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
