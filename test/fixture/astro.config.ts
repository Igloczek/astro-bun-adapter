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
  adapter: bun({
    mode,
    bodySizeLimit: 1024 * 1024,
    staticHeaders: true,
    trustedProxies: ["127.0.0.1", "::1"],
    // Only used when the entry runs directly; the runner disables autostart.
    ...(mode === "standalone" ? { workers: 2 } : {}),
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
});
