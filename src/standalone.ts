import type { BaseApp } from "astro/app";

import { logListeningOn } from "./log-listening-on.js";
import {
  hostOptions,
  rejectRemovedTlsEnv,
  runtimePort,
} from "./runtime-env.js";
import { createAppHandler } from "./serve-app.js";
import { createStaticHandler } from "./serve-static.js";
import type { BunAppHeadersJson, Options, RequestHandler } from "./types.js";

export function createStandaloneHandler(
  app: BaseApp,
  options: Options,
  headersMap: BunAppHeadersJson | undefined,
): RequestHandler {
  const appHandler = createAppHandler(app, options);
  const staticHandler = createStaticHandler(app, options, headersMap);

  return async (request, context) => {
    try {
      decodeURI(new URL(request.url).pathname);
    } catch {
      return new Response("Bad request.", { status: 400 });
    }
    return (await staticHandler(request)) ?? appHandler(request, context);
  };
}

export function createServer(
  listener: RequestHandler,
  host: string,
  port: number,
  options: Pick<Options, "bodySizeLimit" | "idleTimeout" | "reusePort">,
) {
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  rejectRemovedTlsEnv();
  const server = Bun.serve({
    hostname: host,
    port,
    reusePort: options.reusePort,
    ...(options.idleTimeout === undefined
      ? {}
      : { idleTimeout: options.idleTimeout }),
    ...(options.bodySizeLimit === undefined
      ? {}
      : { maxRequestBodySize: options.bodySizeLimit }),
    fetch(request, bunServer) {
      const clientAddress = bunServer.requestIP(request)?.address;
      return listener(request, {
        ...(clientAddress === undefined ? {} : { clientAddress }),
        ...(bunServer.port === undefined ? {} : { serverPort: bunServer.port }),
      });
    },
    error(error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  let stopping: Promise<void> | undefined;
  return {
    server,
    host,
    port: server.port ?? port,
    closed() {
      return closed;
    },
    stop(force = false) {
      stopping ??= server.stop(force).then(() => resolveClosed?.());
      return stopping;
    },
  };
}

export default function standalone(
  app: BaseApp,
  options: Options,
  headersMap: BunAppHeadersJson | undefined,
) {
  const port = runtimePort(options);
  const host = process.env.HOST ?? hostOptions(options.host);
  const server = createServer(
    createStandaloneHandler(app, { ...options, host, port }, headersMap),
    host,
    port,
    options,
  );

  if (process.env.ASTRO_BUN_LOGGING !== "disabled") {
    logListeningOn(app.adapterLogger, server.server, host);
  }
  void server.closed().finally(() => app.logger.close());
  return { server: server.server, done: server.closed(), stop: server.stop };
}
