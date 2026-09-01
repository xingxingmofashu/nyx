import type { CommandModule } from "yargs";

type WithDoubleDash<T> = T & { "--"?: string[] };

/**
 * Type helper for yargs command modules (ghostty-config style).
 * Carries the handler args type so options stay typed.
 */
export function cmd<T, U>(input: CommandModule<T, WithDoubleDash<U>>) {
  return input;
}
