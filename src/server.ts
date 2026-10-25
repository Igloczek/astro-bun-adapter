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
let workerTotal: number | undefined;
// Read on first use, so importing the entry doesn't validate or warn.
function configuredWorkers() {
  if (workerTotal !== undefined) return workerTotal;
  workerTotal = isWorker ? 1 : workerCount(config.workers);
  if (workerTotal > 1 && isWatching()) {
    console.warn(
      `[${PACKAGE_NAME}] bun --watch and --hot reload this process in place; running 1 process instead of ${workerTotal} workers.`,
    );
    workerTotal = 1;
  }
  return workerTotal;
}

/** Supervision for the process that starts the server. */
const workers = {
  /** `true` in the first process when more than one worker is configured. */
  get isSupervisor() {
    return configuredWorkers() > 1;
  },
  /**
   * Runs `beforeStart`, then starts the workers by running this process's
   * command again, and exits when they stop. Never returns.
   */
  async supervise(): Promise<never> {
    if (!workers.isSupervisor) {
      throw new AstroError(
        `[${PACKAGE_NAME}] workers.supervise() only runs in the first process with 'workers' above 1; check workers.isSupervisor first.`,
      );
    }
    await beforeStart();
    if (config.mode === "standalone" && runtimePort(config) === 0) {
      throw new AstroError(
        `[${PACKAGE_NAME}] 'workers' requires a fixed PORT; port 0 gives every worker a different port.`,
      );
    }
    return supervise({
      command: relaunchCommand(),
      workers: configuredWorkers(),
    });
  },
};

if (isWorker) stopWithSupervisor();

// A standalone entry is the server, so it supervises itself. In middleware
// mode the custom server calls workers.supervise() explicitly.
if (config.mode === "standalone" && autostart && !isWorker) {
  if (workers.isSupervisor) await workers.supervise();
  else await beforeStart();
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

export { beforeStart, handler, options, startServer, workers };
