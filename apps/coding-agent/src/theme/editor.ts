import chalk from "chalk";

export const editorTheme = {
  borderColor: (s: string) => chalk.gray(s),
  selectList: {
    selectedPrefix: (s: string) => chalk.green("> " + s),
    selectedText: (s: string) => chalk.bold(s),
    description: (s: string) => chalk.gray(s),
    scrollInfo: (s: string) => chalk.gray(s),
    noMatch: (s: string) => chalk.gray(s),
  },
};
