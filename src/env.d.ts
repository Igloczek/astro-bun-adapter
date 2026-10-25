declare module "virtual:igloczek-astro-bun-adapter:config" {
  import type { Options } from "./types.js";

  export const bodySizeLimit: Options["bodySizeLimit"];
  export const client: Options["client"];
  export const experimentalDisableStreaming: Options["experimentalDisableStreaming"];
  export const host: Options["host"];
  export const imageEndpointRoute: Options["imageEndpointRoute"];
  export const idleTimeout: Options["idleTimeout"];
  export const mode: Options["mode"];
  export const port: Options["port"];
  export const reusePort: Options["reusePort"];
  export const server: Options["server"];
  export const staticHeaders: Options["staticHeaders"];
  export const trustedProxies: Options["trustedProxies"];
  export const workers: Options["workers"];
}

declare module "virtual:igloczek-astro-bun-adapter:before-start" {
  /** Runs the configured `beforeStart` modules in order. */
  export default function beforeStart(): Promise<void>;
}
