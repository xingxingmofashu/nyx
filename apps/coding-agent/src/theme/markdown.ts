import type { MarkdownTheme } from "@earendil-works/pi-tui";
import chalk from "chalk";

export const defaultMarkdownTheme: MarkdownTheme = {
  heading: (s) => chalk.bold(s),
  link: (s) => chalk.blue(s),
  linkUrl: (s) => chalk.gray(s),
  code: (s) => chalk.cyan(s),
  codeBlock: (s) => chalk.cyan(s),
  codeBlockBorder: (s) => chalk.gray(s),
  quote: (s) => chalk.gray(s),
  quoteBorder: (s) => chalk.gray(s),
  hr: (s) => chalk.gray(s),
  listBullet: (s) => chalk.yellow(s),
  bold: (s) => chalk.bold(s),
  italic: (s) => chalk.italic(s),
  strikethrough: (s) => chalk.strikethrough(s),
  underline: (s) => chalk.underline(s),
};
