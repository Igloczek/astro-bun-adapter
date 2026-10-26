import "./watch-supervisor.js";

import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";
import * as config from "virtual:igloczek-astro-bun-adapter:config";

import createMiddleware from "./middleware.js";
import { PACKAGE_NAME } from "./runtime-env.js";
import { readHeadersJson, resolveOutputDir } from "./shared.js";
import standalone, { createStandaloneHandler } from "./standalone.js";
import { isWorker, shutdownTimeout } from "./worker.js";
import type { Options } from "./types.js";

setGetEnv((key) => process.env[key]);

const autostart = process.env.ASTRO_BUN_AUTOSTART !== "disabled";
const stopTimeout = shutdownTimeout(config.shutdownTimeout);

// Processes started by `supervise()` share one port, including custom servers
// that pass `options.reusePort` to Bun.serve().
const options: Options = isWorker
  ? { ...config, reusePort: true }
  : { ...config };

const app = createApp({ streaming: !options.experimentalDisableStreaming });
const headersMap = options.staticHeaders
  ? await readHeadersJson(resolveOutputDir(options))
  : undefined;
const handler =
  options.mode === "middleware"
    ? createMiddleware(app, options)
    : createStandaloneHandler(app, options, headersMap);

let running: ReturnType<typeof standalone> | undefined;
const startServer = () => (running ??= standalone(app, options, headersMap));

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

export { handler, options, startServer };
