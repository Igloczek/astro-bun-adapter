import {
  DEFAULT_SHUTDOWN_TIMEOUT,
  isShutdownTimeout,
  MAX_SHUTDOWN_TIMEOUT,
  PACKAGE_NAME,
} from "./config.js";

export interface SuperviseOptions {
  /** Command that starts one worker. */
  command: string[];
  /** Number of workers. Each one must listen with `reusePort: true`. */
  workers: number;
  /**
   * Seconds workers get to exit after `SIGINT` or `SIGTERM` before they are
   * killed. Defaults to `60`.
   */
  shutdownTimeout?: number;
}

/** Environment variable holding a supervised worker's index, from `0`. */
export const WORKER_ENV = "ASTRO_BUN_WORKER";
/** Environment variable holding the supervisor's process ID. */
export const SUPERVISOR_ENV = "ASTRO_BUN_SUPERVISOR_PID";

const RESTART_DELAY_MS = 500;
const RESTART_WINDOW_MS = 60_000;
const RESTARTS_PER_WORKER = 3;

function log(message: string, error?: unknown) {
  console.error(`[${PACKAGE_NAME}] ${message}`, ...(error ? [error] : []));
}

async function run({
  command,
  workers,
  shutdownTimeout = DEFAULT_SHUTDOWN_TIMEOUT,
}: SuperviseOptions) {
  if (
    !Array.isArray(command) ||
    command.length === 0 ||
    command.some((part) => typeof part !== "string")
  ) {
    throw new TypeError(
      `[${PACKAGE_NAME}] 'command' must be a non-empty array of strings.`,
    );
  }
  if (!Number.isSafeInteger(workers) || workers < 1) {
    throw new TypeError(
      `[${PACKAGE_NAME}] 'workers' must be a positive integer.`,
    );
  }
  if (!isShutdownTimeout(shutdownTimeout)) {
    throw new TypeError(
      `[${PACKAGE_NAME}] 'shutdownTimeout' must be a number of seconds from 0 through ${MAX_SHUTDOWN_TIMEOUT}.`,
    );
  }

  let count = workers;
  if (count > 1 && process.platform !== "linux") {
    // Other platforms accept the shared port but send every connection to one
    // process, so extra workers would only use memory.
    log(
      `Bun only balances reusePort connections on Linux; starting 1 worker instead of ${count}.`,
    );
    count = 1;
  }

  const children = new Set<Bun.Subprocess>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const restarts: number[] = [];
  const stopped = Promise.withResolvers<void>();
  let stopping = false;
  let exitCode = 0;

  const signalAll = (signal: NodeJS.Signals) => {
    for (const child of children) {
      try {
        child.kill(signal);
      } catch (error) {
        log(`Failed to signal worker process ${child.pid}`, error);
      }
    }
  };

  const shutdown = (signal: NodeJS.Signals, code: number) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const timer of timers) clearTimeout(timer);
    signalAll(signal);
    killTimer = setTimeout(() => {
      log(`Workers did not stop within ${shutdownTimeout}s; killing them.`);
      signalAll("SIGKILL");
    }, shutdownTimeout * 1000);
    stopped.resolve();
  };

  const onSignal = (signal: NodeJS.Signals) => {
    // A second signal means the workers are taking too long to stop.
    if (stopping) signalAll("SIGKILL");
    else shutdown(signal, 0);
  };

  const spawn = (index: number) => {
    let child: Bun.Subprocess;
    try {
      child = Bun.spawn(command, {
        env: {
          ...process.env,
          [WORKER_ENV]: String(index),
          [SUPERVISOR_ENV]: String(process.pid),
        },
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      });
    } catch (error) {
      log(`Failed to start worker ${index}`, error);
      shutdown("SIGTERM", 1);
      return;
    }

    children.add(child);
    void child.exited.then((code) => {
      children.delete(child);
      if (stopping) return;

      const reason = child.signalCode ?? `code ${code}`;
      const now = Date.now();
      while (restarts.length && restarts[0]! <= now - RESTART_WINDOW_MS) {
        restarts.shift();
      }
      if (restarts.length >= count * RESTARTS_PER_WORKER) {
        log(
          `Worker ${index} exited with ${reason}; workers keep exiting, stopping.`,
        );
        shutdown("SIGTERM", 1);
        return;
      }
      restarts.push(now);
      log(`Worker ${index} exited with ${reason}; restarting.`);
      const timer = setTimeout(() => {
        timers.delete(timer);
        spawn(index);
      }, RESTART_DELAY_MS);
      timers.add(timer);
    });
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    for (let index = 0; index < count && !stopping; index++) spawn(index);
    await stopped.promise;
    await Promise.allSettled([...children].map((child) => child.exited));
  } finally {
    clearTimeout(killTimer);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  return exitCode;
}

/**
 * Runs `workers` copies of `command` on one port and exits when they stop.
 * Workers that exit are restarted, unless workers exit more than
 * `3 × workers` times within a minute. `SIGINT` and `SIGTERM` are forwarded to
 * every worker; workers still running after `shutdownTimeout`, or when a
 * second signal arrives, are killed.
 */
export async function supervise(options: SuperviseOptions): Promise<never> {
  process.exit(await run(options));
}
