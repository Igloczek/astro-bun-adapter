import { fileURLToPath } from "node:url";

import { defineConfig } from "astro/config";
import bun from "@igloczek/astro-bun-adapter";

const mode =
  process.env.ADAPTER_MODE === "middleware" ? "middleware" : "standalone";

const imageRoute = process.env.FIXTURE_IMAGE_ROUTE;

export default defineConfig({
  output: "server",
  ...(process.env.FIXTURE_BASE ? { base: process.env.FIXTURE_BASE } : {}),
  ...(imageRoute
    ? {
        image: {
          endpoint: { route: imageRoute },
          service: { entrypoint: "./src/image-service.ts" },
        },
      }
    : {}),
  integrations: [
    {
      name: "fixture-renderer",
      hooks: {
        "astro:config:setup": ({ addRenderer }) => {
          addRenderer({
            name: "fixture-renderer",
            serverEntrypoint: fileURLToPath(
              new URL("./src/renderer.ts", import.meta.url),
            ),
          });
        },
      },
    },
  ],
  adapter: bun({
    mode,
    bodySizeLimit: 1024 * 1024,
    staticHeaders: true,
    trustedProxies: ["127.0.0.1", "::1"],
  }),
  build: { format: "directory" },
  security: {
    csp: true,
    allowedDomains: [
      { hostname: "127.0.0.1" },
      { hostname: "cringe-o-meter.com" },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4321,
    headers: { "x-adapter-preview": "active" },
  },
  trailingSlash: "never",
  // One chunk for all of Astro, as an app might configure: workers must still
  // watch their supervisor before the app loads.
  ...(process.env.FIXTURE_VENDOR_CHUNK
    ? {
        vite: {
          build: {
            rolldownOptions: {
              output: {
                manualChunks: (id: string) =>
                  id.includes("/node_modules/astro/")
                    ? "astro-vendor"
                    : undefined,
              },
            },
          },
        },
      }
    : {}),
});
