import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";

let quiet = false;

/** When true, success() and dim() do nothing (for --quiet scripting). */
export function setQuiet(value: boolean): void {
  quiet = value;
}

export function isQuiet(): boolean {
  return quiet;
}

export function success(msg: string): void {
  if (!quiet) console.log(chalk.green(msg));
}

export function error(msg: string): void {
  console.error(chalk.red(msg));
}

export function info(msg: string): void {
  if (!quiet) console.log(chalk.blue(msg));
}

export function dim(msg: string): void {
  if (!quiet) console.log(chalk.dim(msg));
}

export function warn(msg: string): void {
  if (!quiet) console.log(chalk.yellow(msg));
}

/** Non-spinner step label (e.g. init flow). */
export function step(msg: string): void {
  if (!quiet) console.log(chalk.dim("› " + msg));
}

export interface SpinnerHandle {
  start(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
  updateText(text: string): void;
}

const noopSpinner: SpinnerHandle = {
  start() {},
  succeed() {},
  fail() {},
  stop() {},
  updateText() {},
};

/** Create a spinner for long operations. When quiet, returns a no-op. */
export function createSpinner(): SpinnerHandle {
  if (quiet) return noopSpinner;
  const spinner = ora({ text: "" });
  return {
    start(text: string) {
      spinner.start(text);
    },
    succeed(text?: string) {
      spinner.succeed(text);
    },
    fail(text?: string) {
      spinner.fail(text);
    },
    stop() {
      spinner.stop();
    },
    updateText(text: string) {
      spinner.text = text;
    },
  };
}

/** Render a single-column table (e.g. for list output). When quiet, does nothing. */
export function printTable(head: string[], rows: string[][]): void {
  if (quiet) return;
  const table = new Table({ head });
  for (const row of rows) table.push(row);
  console.log(table.toString());
}
