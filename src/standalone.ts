import type { BaseApp } from "astro/app";

import { PACKAGE_NAME } from "./config.js";
import { logListeningOn } from "./log-listening-on.js";
import { createAppHandler } from "./serve-app.js";
import { createStaticHandler } from "./serve-static.js";
import type {
  BunAppHeadersJson,
  Options,
  RequestHandler,
  TlsOptions,
} from "./types.js";

export const hostOptions = (host: string | boolean) => {
  if (typeof host === "boolean") return host ? "0.0.0.0" : "localhost";
  return host;
};

function parsePort(value: string | undefined, fallback: number) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `[${PACKAGE_NAME}] PORT must be an integer from 0 through 65535.`,
    );
  }
  return port;
}

function runtimeTls(config: TlsOptions | undefined) {
  const certPath = config?.certPath ?? process.env.SERVER_CERT_PATH;
  const keyPath = config?.keyPath ?? process.env.SERVER_KEY_PATH;
  if (!certPath && !keyPath) return undefined;
  if (!certPath || !keyPath) {
    throw new Error(
      `[${PACKAGE_NAME}] TLS requires both SERVER_CERT_PATH and SERVER_KEY_PATH (or tls.certPath and tls.keyPath).`,
    );
  }

  const caPath = config?.caPath ?? process.env.SERVER_CA_PATH;
  const serverName = config?.serverName ?? process.env.SERVER_NAME;
  const passphrase = process.env.SERVER_KEY_PASSPHRASE;
  return {
    cert: Bun.file(certPath),
    key: Bun.file(keyPath),
    ...(caPath ? { ca: Bun.file(caPath) } : {}),
    ...(serverName ? { serverName } : {}),
    ...(passphrase ? { passphrase } : {}),
  };
}

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
  options: Pick<Options, "bodySizeLimit" | "idleTimeout" | "reusePort" | "tls">,
) {
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const tls = runtimeTls(options.tls);
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
    ...(tls ? { tls } : {}),
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
  const port = parsePort(process.env.PORT, options.port ?? 8080);
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
