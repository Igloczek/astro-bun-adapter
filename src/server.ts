import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";
import * as options from "virtual:igloczek-astro-bun-adapter:config";

import createMiddleware from "./middleware.js";
import { readHeadersJson, resolveOutputDir } from "./shared.js";
import standalone, { createStandaloneHandler } from "./standalone.js";

setGetEnv((key) => process.env[key]);

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
  startServer();
}

export { handler, options, startServer };
