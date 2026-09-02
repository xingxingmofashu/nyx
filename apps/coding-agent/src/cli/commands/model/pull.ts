/**
 * `nyx model pull <model>` — pre-download a model into the local ONNX cache.
 */

import { cmd } from "../../utils/cmd";
import { getModelsDir } from "@nyx/config";
import { pullModel, type ModelRuntimeOptions, type ProgressInfo } from "@nyx/llm";
import { log, spinner } from "@clack/prompts";

type TaskId = "text-generation" | "image-to-image";

/** transformers.js dtype per pipeline task (mirrors each engine's loader). */
const TASK_DTYPES: Record<TaskId, NonNullable<ModelRuntimeOptions["dtype"]>> = {
  "text-generation": "q4",
  "image-to-image": "fp32",
};

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
        choices: Object.keys(TASK_DTYPES),
        demandOption: true,
        description: "Pipeline task: text-generation or image-to-image",
      }),
  handler: async (args: PullArgs) => {
    if (!args.model) {
      log.error("Usage: nyx model pull <model> --task <text-generation|image-to-image>");
      process.exit(1);
    }
    const task = args.task as TaskId;
    const model = args.model;
    const dtype = TASK_DTYPES[task];

    log.info(`Pulling ${task}:${model} (dtype ${dtype})`);

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
      await pullModel(task, model, { dtype, onProgress });
      spin.stop("Model ready");
      log.success(`Cached ${task}:${model} in ${getModelsDir()}`);
    } catch (error) {
      spin.stop("Pull failed");
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
