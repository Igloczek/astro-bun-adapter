// Nothing from Astro may be imported statically here: this entry decides
// first whether the process is a worker supervisor, a supervisor must not run
// app code, and a bundler can merge any Astro module with the app's (e.g. in
// a vendor chunk). Astro and the app load after that decision.
import runBeforeStart from "virtual:igloczek-astro-bun-adapter:before-start";
import * as config from "virtual:igloczek-astro-bun-adapter:config";

import {
  PACKAGE_NAME,
  rejectRemovedTlsEnv,
  runtimePort,
} from "./runtime-env.js";
import { supervise } from "./supervisor.js";
import {
  isWatching,
  isWorker,
  relaunchCommand,
  shutdownTimeout,
  stopWithSupervisor,
  workerCount,
} from "./worker.js";
import type { Options } from "./types.js";

// Explicit types keep the virtual modules out of the published declarations.
const beforeStart: () => Promise<void> = runBeforeStart;

const autostart = process.env.ASTRO_BUN_AUTOSTART !== "disabled";
const stopTimeout = shutdownTimeout(config.shutdownTimeout);
if (isWorker) {
  stopWithSupervisor(stopTimeout);
} else if (autostart) {
  await beforeStart();
  const workers = workerCount(config.workers);
  if (workers > 1 && isWatching()) {
    console.warn(
      `[${PACKAGE_NAME}] bun --watch and --hot reload this process in place; running 1 process instead of ${workers} workers.`,
    );
  } else if (workers > 1) {
    if (config.mode === "standalone") {
      // Fail here once, instead of in every worker until the crash limit.
      rejectRemovedTlsEnv();
      if (runtimePort(config) === 0) {
        throw new Error(
          `[${PACKAGE_NAME}] 'workers' requires a fixed PORT; port 0 gives every worker a different port.`,
        );
      }
    }
    // This process only supervises: the workers rerun its command, and this
    // import never resolves, so a custom server's code runs in the workers.
    await supervise({
      command: relaunchCommand(),
      workers,
      shutdownTimeout: stopTimeout,
    });
  }
}

// Supervised workers share one port, including custom servers that pass
// `options.reusePort` to Bun.serve().
const options: Omit<Options, "beforeStart"> = isWorker
  ? { ...config, reusePort: true }
  : { ...config };

const { setGetEnv } = await import("astro/env/setup");
setGetEnv((key) => process.env[key]);
const { createAppServer } = await import("./app-server.js");
const { handler, startServer } = await createAppServer(options);

if (options.mode === "standalone" && autostart) {
  const { stop } = startServer();
  // Drain in-flight requests on SIGINT or SIGTERM. Without handlers, PID 1 in
  // a container ignores `docker stop`. The supervisor kills workers that
  // hang, and a terminal's Ctrl+C reaches workers twice, so only a process
  // without a supervisor enforces the timeout and treats a repeat as a kill.
  let stopping = false;
  const drain = (signal: NodeJS.Signals) => {
    if (stopping) {
      if (!isWorker) process.exit(1);
      return;
    }
    // Decided before any app listener runs: `once` listeners remove
    // themselves, and the adapter's handler runs first (prepended).
    const appHandlesSignal = process.listenerCount(signal) > 1;
    stopping = true;
    if (!isWorker) {
      setTimeout(() => {
        console.error(
          `[${PACKAGE_NAME}] Server did not stop within ${stopTimeout}s; exiting.`,
        );
        process.exit(1);
      }, stopTimeout * 1000).unref();
    }
    void stop().then(() => {
      // An app that handles the signal too owns the rest of its cleanup, so
      // the process exits once that finishes, within the timeout. Otherwise
      // nothing is left to wait for, open connections included.
      if (!appHandlesSignal) process.exit(process.exitCode ?? 0);
    });
  };
  process.prependListener("SIGINT", drain);
  process.prependListener("SIGTERM", drain);
}

export { beforeStart, handler, options, startServer };
