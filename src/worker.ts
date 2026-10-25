import { AstroError } from "astro/errors";

import {
  DEFAULT_SHUTDOWN_TIMEOUT,
  isShutdownTimeout,
  isWorkerCount,
  PACKAGE_NAME,
} from "./config.js";
import { SUPERVISOR_ENV, WORKER_ENV } from "./supervisor.js";

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

/** The configured shutdown timeout, overridden by `ASTRO_BUN_SHUTDOWN_TIMEOUT`. */
export function shutdownTimeout(configured: number) {
  const value = process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT;
  if (value === undefined || value === "") return configured;
  const seconds = Number(value);
  if (!isShutdownTimeout(seconds)) {
    throw new AstroError(
      `[${PACKAGE_NAME}] ASTRO_BUN_SHUTDOWN_TIMEOUT must be a non-negative number of seconds.`,
    );
  }
  return seconds;
}

/** Whether Bun reloads this process in place, which workers can't follow. */
export function isWatching(execArgv = process.execArgv) {
  return execArgv.some((arg) => arg === "--watch" || arg === "--hot");
}

/** The command that started this process, for starting it again as a worker. */
export function relaunchCommand(
  main = Bun.main,
  execArgv = process.execArgv,
  argv = process.argv,
) {
  // A compiled executable runs its embedded entry, reported under /$bunfs/
  // (B:/~BUN/ on Windows), and applies its own runtime flags.
  if (main.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/.test(main)) {
    return [process.execPath, ...argv.slice(2)];
  }
  const flags: string[] = [];
  for (let index = 0; index < execArgv.length; index++) {
    const arg = execArgv[index]!;
    // The process already runs in that directory; workers inherit it.
    if (arg === "--cwd") index++;
    else if (!arg.startsWith("--cwd=")) flags.push(arg);
  }
  return [process.execPath, ...flags, main, ...argv.slice(2)];
}

/**
 * Stops this worker once its supervisor is gone, so a killed supervisor
 * doesn't leave workers serving the port. The worker gets `SIGTERM`, then is
 * forced to exit after the shutdown timeout the supervisor would enforce.
 */
export function stopWithSupervisor(timeout = DEFAULT_SHUTDOWN_TIMEOUT) {
  const supervisor = Number(process.env[SUPERVISOR_ENV]) || process.ppid;
  const check = () => {
    if (process.ppid === supervisor) return;
    clearInterval(timer);
    console.error(
      `[${PACKAGE_NAME}] Supervisor ${supervisor} is gone; stopping worker.`,
    );
    setTimeout(() => process.exit(1), timeout * 1000).unref();
    process.kill(process.pid, "SIGTERM");
  };
  const timer = setInterval(check, 1000);
  timer.unref();
  check();
}
