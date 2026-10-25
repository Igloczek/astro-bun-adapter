// Everything that loads the app: Astro's app entrypoint and the adapter
// modules built on Astro's app runtime, which import the manifest, renderers
// and a custom `src/fetch.ts`. The server entry imports this module only
// after deciding the process is not a supervisor.
import { createApp } from "astro/app/entrypoint";

import createMiddleware from "./middleware.js";
import { readHeadersJson, resolveOutputDir } from "./shared.js";
import standalone, { createStandaloneHandler } from "./standalone.js";
import type { Options } from "./types.js";

export async function createAppServer(options: Omit<Options, "beforeStart">) {
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
