// Nothing that loads Astro or the app may be imported statically here. A
// worker must watch its supervisor before the app loads, because app modules
// can await slow initialization, and a bundler can move any static Astro
// import into a chunk with the app (e.g. a vendor chunk) that evaluates before
// this module's body. Astro and the app load below, after the watchdog.
import { constants } from "node:os";

import * as config from "virtual:igloczek-astro-bun-adapter:config";

import { PACKAGE_NAME } from "./runtime-env.js";
import { isWorker, shutdownTimeout, stopWithSupervisor } from "./worker.js";
import type { Options } from "./types.js";

if (isWorker) stopWithSupervisor();

const autostart = process.env.ASTRO_BUN_AUTOSTART !== "disabled";
const stopTimeout = shutdownTimeout(config.shutdownTimeout);

// Processes started by `supervise()` share one port, including custom servers
// that pass `options.reusePort` to Bun.serve().
const options: Options = isWorker
  ? { ...config, reusePort: true }
  : { ...config };

const standalone = options.mode === "standalone" && autostart;
let stopServer: (() => Promise<void>) | undefined;
let stopping = false;

// Drain in-flight requests on SIGINT or SIGTERM. Without handlers, PID 1 in a
// container ignores `docker stop`. The supervisor kills workers that hang,
// and a terminal's Ctrl+C reaches workers twice, so only a process without a
// supervisor enforces the timeout and treats a repeat as a kill.
// Registered before the app loads: an app module can register its own
// handler and then await slow initialization, and a signal in that gap must
// still stop the server instead of letting it start afterwards.
const drain = (signal: NodeJS.Signals) => {
  if (stopping) {
    if (!isWorker) process.exit(1);
    return;
  }
  // Decided before any app listener runs: `once` listeners remove
  // themselves, and the adapter's handler runs first (prepended).
  const appHandlesSignal = process.listenerCount(signal) > 1;
  if (!stopServer && !appHandlesSignal) {
    // Still loading, with nothing to drain and nobody else to notify. Exit
    // with the signal's status rather than re-raising it: PID 1 in a
    // container ignores a signal it has no handler for.
    process.exit(128 + constants.signals[signal]);
  }
  stopping = true;
  if (!isWorker) {
    setTimeout(() => {
      console.error(
        `[${PACKAGE_NAME}] ${stopServer ? "Server" : "App"} did not stop within ${stopTimeout}s; exiting.`,
      );
      process.exit(1);
    }, stopTimeout * 1000).unref();
  }
  // While the app is still loading, the server never starts (below), and
  // the process exits once the app's own handler and loading finish.
  void stopServer?.().then(() => {
    // An app that handles the signal too owns the rest of its cleanup, so
    // the process exits once that finishes, within the timeout. Otherwise
    // nothing is left to wait for, open connections included.
    if (!appHandlesSignal) process.exit(process.exitCode ?? 0);
  });
};
if (standalone) {
  process.prependListener("SIGINT", drain);
  process.prependListener("SIGTERM", drain);
}

const { createAppServer } = await import("./app-server.js");
const { handler, startServer } = await createAppServer(options);

// A signal that arrived while the app was loading means never serving.
if (standalone && !stopping) stopServer = startServer().stop;

export { handler, options, startServer };
