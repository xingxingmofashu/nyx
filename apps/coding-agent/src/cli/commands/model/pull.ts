/**
 * `nyx model pull <model>` — pre-download a model into the local ONNX cache.
 */

import { cmd } from "../../utils/cmd";
import { getModelsDir, ModelTaskSchema, type ModelTask } from "@nyx/config";
import { pull, type ProgressInfo } from "@nyx/llm";
import { log, spinner } from "@clack/prompts";

const TASK_CHOICES = ["text-generation", "image-to-image"] as const;

interface PullArgs {
  model?: string;
  task?: string;
}

export const PullCommand = cmd<Record<string, unknown>, PullArgs>({
  command: "pull <model>",
  describe: "Pre-download an ONNX model into the local cache",
  builder: (yargs) =>
    yargs
      .positional("model", {
        type: "string",
        describe: "Model id",
      })
      .option("task", {
        type: "string",
        choices: TASK_CHOICES,
        demandOption: true,
        description: "Pipeline task: text-generation or image-to-image",
      }),
  handler: async (args: PullArgs) => {
    if (!args.model) {
      log.error("Usage: nyx model pull <model> --task <text-generation|image-to-image>");
      process.exit(1);
    }
    const parsedTask = ModelTaskSchema.safeParse(args.task);
    if (!parsedTask.success) {
      log.error("--task must be one of: text-generation, image-to-image");
      process.exit(1);
    }
    const task = parsedTask.data as ModelTask;
    const model = args.model;

    log.info(`Pulling ${task}:${model}`);

    const spin = spinner();
    spin.start("Downloading model...");

    let lastFile = "";
    const onProgress = (info: ProgressInfo) => {
      if (info.status === "progress" && info.file !== lastFile) {
        lastFile = info.file;
        spin.message(`Downloading ${info.file} (${info.loaded}/${info.total} bytes)`);
      } else if (info.status === "done" && info.file) {
        spin.message(`Downloaded ${info.file}`);
      }
    };

    try {
      await pull(model, task, onProgress);
      spin.stop("Model ready");
      log.success(`Cached ${task}:${model} in ${getModelsDir()}`);
    } catch (error) {
      spin.stop("Pull failed");
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
