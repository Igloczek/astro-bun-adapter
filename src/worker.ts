import {
  DEFAULT_SHUTDOWN_TIMEOUT,
  isShutdownTimeout,
  MAX_SHUTDOWN_TIMEOUT,
  PACKAGE_NAME,
} from "./runtime-env.js";
import { SUPERVISOR_ENV, WORKER_ENV } from "./supervisor.js";

/** Whether `supervise()` started this process. */
export const isWorker = process.env[WORKER_ENV] !== undefined;

/** The configured shutdown timeout, overridden by `ASTRO_BUN_SHUTDOWN_TIMEOUT`. */
export function shutdownTimeout(configured: number) {
  const value = process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT;
  if (value === undefined || value === "") return configured;
  const seconds = Number(value);
  if (!isShutdownTimeout(seconds)) {
    throw new Error(
      `[${PACKAGE_NAME}] ASTRO_BUN_SHUTDOWN_TIMEOUT must be a number of seconds from 0 through ${MAX_SHUTDOWN_TIMEOUT}.`,
    );
  }
  return seconds;
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
