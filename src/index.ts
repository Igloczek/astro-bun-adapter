// Structurally based on @astrojs/node, MIT licensed by the Astro contributors.
import { fileURLToPath } from "node:url";

import { sessionDrivers } from "astro/config";
import type { AstroIntegration } from "astro";

import {
  normalizeUserOptions,
  PACKAGE_NAME,
  runtimeOptions,
} from "./config.js";
import { STATIC_HEADERS_FILE, writeHeadersJson } from "./shared.js";
import type {
  BunAppHeadersJson,
  BunRequestContext,
  RequestHandler,
  TlsOptions,
  UserOptions,
} from "./types.js";
import { createConfigPlugin } from "./vite-plugin-config.js";

export type {
  BunAppHeadersJson,
  BunRequestContext,
  RequestHandler,
  TlsOptions,
  UserOptions,
};

export function getAdapter({
  staticHeaders,
}: Pick<UserOptions, "staticHeaders">) {
  return {
    name: PACKAGE_NAME,
    entrypointResolution: "auto" as const,
    serverEntrypoint: `${PACKAGE_NAME}/server.js`,
    previewEntrypoint: `${PACKAGE_NAME}/preview.js`,
    adapterFeatures: {
      buildOutput: "server" as const,
      middlewareMode: "classic" as const,
      staticHeaders: staticHeaders ?? false,
    },
    supportedAstroFeatures: {
      hybridOutput: "stable" as const,
      staticOutput: "stable" as const,
      serverOutput: "stable" as const,
      sharpImageService: "stable" as const,
      i18nDomains: "experimental" as const,
      envGetSecret: "stable" as const,
    },
  };
}

export default function createIntegration(
  input: UserOptions,
): AstroIntegration {
  const userOptions = normalizeUserOptions(input);
  let config: import("astro").AstroConfig | undefined;
  let routeToHeaders: Map<string, { headers: Headers }> | undefined;

  return {
    name: PACKAGE_NAME,
    hooks: {
      "astro:config:setup": async ({
        updateConfig,
        config: astroConfig,
        logger,
        command,
      }) => {
        config = astroConfig;
        let session = astroConfig.session;

        if (session !== false && !session?.driver) {
          logger.info("Enabling sessions with filesystem storage");
          session = {
            driver: sessionDrivers.fsLite({
              base: fileURLToPath(new URL("sessions", astroConfig.cacheDir)),
            }),
            cookie: session?.cookie,
            ttl: session?.ttl,
          };
        }

        updateConfig({
          build: { redirects: false },
          image: {
            endpoint: {
              route: astroConfig.image.endpoint.route ?? "_image",
              entrypoint:
                astroConfig.image.endpoint.entrypoint ??
                (command === "dev"
                  ? "astro/assets/endpoint/dev"
                  : "astro/assets/endpoint/generic"),
            },
          },
          session,
          vite: {
            plugins: [
              createConfigPlugin(runtimeOptions(userOptions, astroConfig)),
            ],
          },
        });
      },
      "astro:build:generated": ({
        routeToHeaders: generatedRouteToHeaders,
      }) => {
        routeToHeaders = generatedRouteToHeaders;
      },
      "astro:config:done": ({ setAdapter, config: astroConfig }) => {
        config = astroConfig;
        setAdapter(getAdapter(userOptions));
      },
      "astro:build:done": async () => {
        if (!config || !routeToHeaders?.size || !config.security.csp) return;

        const headersValue: BunAppHeadersJson = [];
        for (const [pathname, { headers }] of routeToHeaders) {
          const csp = headers.get("Content-Security-Policy");
          if (csp) {
            headersValue.push({
              pathname,
              headers: [{ key: "Content-Security-Policy", value: csp }],
            });
          }
        }

        if (headersValue.length) {
          await writeHeadersJson(
            new URL(STATIC_HEADERS_FILE, config.outDir),
            headersValue,
          );
        }
      },
    },
  };
}
