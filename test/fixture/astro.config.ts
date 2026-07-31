import { defineConfig } from "astro/config";
import bun from "@igloczek/astro-bun-adapter";

const mode =
  process.env.ADAPTER_MODE === "middleware" ? "middleware" : "standalone";

export default defineConfig({
  output: "server",
  adapter: bun({
    mode,
    bodySizeLimit: 1024 * 1024,
    staticHeaders: true,
    trustedProxies: ["127.0.0.1", "::1"],
  }),
  build: { format: "directory" },
  security: { csp: true },
  server: {
    host: "127.0.0.1",
    port: 4321,
    headers: { "x-adapter-preview": "active" },
  },
  trailingSlash: "never",
});
