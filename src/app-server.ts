// Everything that loads Astro and the app. The server entry imports this
// module dynamically, after a worker starts watching its supervisor.
import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";

import createMiddleware from "./middleware.js";
import { readHeadersJson, resolveOutputDir } from "./shared.js";
import standalone, { createStandaloneHandler } from "./standalone.js";
import type { Options } from "./types.js";

export async function createAppServer(options: Options) {
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
  return { handler, startServer };
}
