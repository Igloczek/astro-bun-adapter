import { createApp } from "astro/app/entrypoint";
import { AstroError } from "astro/errors";
import { setGetEnv } from "astro/env/setup";
import * as config from "virtual:igloczek-astro-bun-adapter:config";

import { PACKAGE_NAME } from "./config.js";
import createMiddleware from "./middleware.js";
import { readHeadersJson, resolveOutputDir } from "./shared.js";
import standalone, {
  createStandaloneHandler,
  runtimePort,
} from "./standalone.js";
import { supervise, WORKER_ENV } from "./supervisor.js";

setGetEnv((key) => process.env[key]);

const isWorker = process.env[WORKER_ENV] !== undefined;
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

if (
  options.mode === "standalone" &&
  process.env.ASTRO_BUN_AUTOSTART !== "disabled"
) {
  if (options.workers > 1 && !isWorker) {
    if (runtimePort(options) === 0) {
      throw new AstroError(
        `[${PACKAGE_NAME}] 'workers' requires a fixed PORT; port 0 gives every worker a different port.`,
      );
    }
    void supervise({
      command: [
        process.execPath,
        ...process.execArgv,
        Bun.main,
        ...process.argv.slice(2),
      ],
      workers: options.workers,
    });
  } else {
    startServer();
  }
}

export { handler, options, startServer };
