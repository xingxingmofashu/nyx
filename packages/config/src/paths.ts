import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR_NAME = ".nyx";

/** Root config dir (`~/.nyx`); the single source of truth for on-disk layout. */
export function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}
