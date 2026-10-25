import { AstroError } from "astro/errors";

import { isWorkerCount, PACKAGE_NAME } from "./config.js";
import { WORKER_ENV } from "./supervisor.js";

export const isWorker = process.env[WORKER_ENV] !== undefined;

/** The configured worker count, overridden by `ASTRO_BUN_WORKERS`. */
export function workerCount(configured: number) {
  const value = process.env.ASTRO_BUN_WORKERS;
  if (value === undefined || value === "") return configured;
  const count = Number(value);
  if (!isWorkerCount(count)) {
    throw new AstroError(
      `[${PACKAGE_NAME}] ASTRO_BUN_WORKERS must be a positive integer.`,
    );
  }
  return count;
}

/** The command that started this process, for starting it again as a worker. */
export function relaunchCommand() {
  const execArgv: string[] = [];
  for (let index = 0; index < process.execArgv.length; index++) {
    const arg = process.execArgv[index]!;
    // The process already runs in that directory; workers inherit it.
    if (arg === "--cwd") index++;
    else if (!arg.startsWith("--cwd=")) execArgv.push(arg);
  }
  return [process.execPath, ...execArgv, Bun.main, ...process.argv.slice(2)];
}

/**
 * Sends this worker `SIGTERM` once its supervisor is gone, so a killed
 * supervisor doesn't leave workers serving the port.
 */
export function stopWithSupervisor() {
  const supervisor = process.ppid;
  const timer = setInterval(() => {
    if (process.ppid === supervisor) return;
    clearInterval(timer);
    process.kill(process.pid, "SIGTERM");
  }, 1000);
  timer.unref();
}
