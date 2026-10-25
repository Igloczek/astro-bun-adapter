import { fileURLToPath } from "node:url";

import type { CreatePreviewServer } from "astro";
import { AstroError } from "astro/errors";

import { logListeningOn } from "./log-listening-on.js";
import { createServer } from "./standalone.js";
import type { Options, RequestHandler } from "./types.js";

const createPreviewServer: CreatePreviewServer = async (preview) => {
  let handler: RequestHandler;
  let options: Pick<
    Options,
    "bodySizeLimit" | "http2" | "idleTimeout" | "reusePort" | "tls"
  > = { reusePort: false };
  const previousAutostart = process.env.ASTRO_BUN_AUTOSTART;

  try {
    process.env.ASTRO_BUN_AUTOSTART = "disabled";
    const serverModule = await import(preview.serverEntrypoint.toString());
    if (typeof serverModule.handler !== "function") {
      throw new AstroError(
        "The server entrypoint does not export a handler. Build the project before running preview.",
      );
    }
    handler = serverModule.handler;
    options = { ...serverModule.options, reusePort: false };
  } catch (error) {
    const cause = error as NodeJS.ErrnoException & { url?: string };
    if (
      cause.code === "ERR_MODULE_NOT_FOUND" &&
      cause.url === preview.serverEntrypoint.href
    ) {
      throw new AstroError(
        `The server entrypoint ${fileURLToPath(preview.serverEntrypoint)} does not exist. Run astro build first.`,
      );
    }
    throw error;
  } finally {
    if (previousAutostart === undefined) delete process.env.ASTRO_BUN_AUTOSTART;
    else process.env.ASTRO_BUN_AUTOSTART = previousAutostart;
  }

  const host = process.env.HOST ?? preview.host ?? "0.0.0.0";
  const port = preview.port ?? 4321;
  const server = createServer(
    async (request, context) => {
      const response = await handler(request, context);
      if (response.status !== 200 || !preview.headers) return response;

      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(preview.headers)) {
        if (value) {
          headers.set(
            name,
            Array.isArray(value) ? value.join(", ") : String(value),
          );
        }
      }
      return new Response(response.body, { status: response.status, headers });
    },
    host,
    port,
    options,
  );
  logListeningOn(preview.logger, server.server, host);
  return server;
};

export default createPreviewServer;
