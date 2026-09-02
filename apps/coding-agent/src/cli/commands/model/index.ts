/**
 * `nyx model` — manage locally cached ONNX models.
 */

import { cmd } from "../../utils/cmd";
import { PullCommand } from "./pull";
import { ModelListCommand } from "./list";

export const ModelCommand = cmd<Record<string, unknown>, Record<string, unknown>>({
  command: "model",
  describe: "Manage locally cached ONNX models",
  builder: (yargs) => yargs.command(PullCommand).command(ModelListCommand).demandCommand(1, "Specify a subcommand"),
  handler: async () => {},
});
