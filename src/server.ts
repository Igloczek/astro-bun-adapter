import { createApp } from "astro/app/entrypoint";
import { AstroError } from "astro/errors";
import { setGetEnv } from "astro/env/setup";
import beforeStart from "virtual:igloczek-astro-bun-adapter:before-start";
import * as config from "virtual:igloczek-astro-bun-adapter:config";

import { PACKAGE_NAME } from "./config.js";
import createMiddleware from "./middleware.js";
import { readHeadersJson, resolveOutputDir } from "./shared.js";
import standalone, {
  createStandaloneHandler,
  runtimePort,
} from "./standalone.js";
import { supervise } from "./supervisor.js";
import {
  isWatching,
  isWorker,
  relaunchCommand,
  stopWithSupervisor,
  workerCount,
} from "./worker.js";

setGetEnv((key) => process.env[key]);

const autostart = process.env.ASTRO_BUN_AUTOSTART !== "disabled";
if (isWorker) {
  stopWithSupervisor();
} else if (autostart) {
  await beforeStart();
  const workers = workerCount(config.workers);
  if (workers > 1 && isWatching()) {
    console.warn(
      `[${PACKAGE_NAME}] bun --watch and --hot reload this process in place; running 1 process instead of ${workers} workers.`,
    );
  } else if (workers > 1) {
    if (config.mode === "standalone" && runtimePort(config) === 0) {
      throw new AstroError(
        `[${PACKAGE_NAME}] 'workers' requires a fixed PORT; port 0 gives every worker a different port.`,
      );
    }
    // This process only supervises: the workers rerun its command, and this
    // import never resolves, so a custom server's code runs in the workers.
    await supervise({ command: relaunchCommand(), workers });
  }
}

// Supervised workers share one port, including custom servers that pass
// `options.reusePort` to Bun.serve().
const options = isWorker ? { ...config, reusePort: true } : { ...config };

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
  if (isWorker) {
    // Drain in-flight requests; the supervisor kills workers that hang. A
    // terminal's Ctrl+C reaches workers twice, so repeats must not kill.
    const drain = () => void stop().then(() => process.exit(0));
    process.on("SIGINT", drain);
    process.on("SIGTERM", drain);
  }
}

export { beforeStart, handler, options, startServer };
