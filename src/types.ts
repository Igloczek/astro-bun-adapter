import type { AstroConfig } from "astro";

export interface UserOptions {
  /**
   * `standalone` starts Bun.serve automatically. `middleware` exports a Fetch
   * handler for Hono, Elysia, or a custom Bun server.
   */
  mode: "middleware" | "standalone";
  /** Disables Astro HTML streaming. */
  experimentalDisableStreaming?: boolean;
  /** Persists Astro's generated static headers for the runtime server. */
  staticHeaders?: boolean;
  /**
   * Maximum request body size in bytes. `0` or `Infinity` disables the limit.
   * When omitted, Bun's default is preserved.
   */
  bodySizeLimit?: number;
  /** Allows multiple Bun processes to accept connections on the same port. */
  reusePort?: boolean;
  /**
   * Server processes to run on one port. Above `1`, the process that starts
   * the server supervises that many workers with `reusePort` (Linux only).
   * `ASTRO_BUN_WORKERS` overrides it at runtime.
   */
  workers?: number;
  /**
   * Modules to run once, in order, before the server or its workers start:
   * paths relative to the project root, or any specifier Vite resolves. A
   * default export function is awaited.
   */
  beforeStart?: string | string[];
  /**
   * Bun's HTTP idle timeout in seconds (`0` disables it, maximum `255`).
   * When omitted, Bun's 10-second default is preserved.
   */
  idleTimeout?: number;
  /**
   * Exact proxy IPs allowed to supply `X-Forwarded-For`. Client addresses are
   * taken from the peer unless the proxy is listed.
   */
  trustedProxies?: string[];
}

export interface Options extends UserOptions {
  client: string;
  /** Route Astro serves the image endpoint on, without `base` (e.g. `/_image`). */
  imageEndpointRoute?: string;
  experimentalDisableStreaming: boolean;
  host: string | boolean;
  port: number;
  reusePort: boolean;
  server: string;
  staticHeaders: boolean;
  trustedProxies: string[];
  workers: number;
  /** Resolved `beforeStart` specifiers; not exposed to the runtime. */
  beforeStart?: string[];
}

export interface BunRequestContext {
  /** Direct peer address, normally from `server.requestIP(request)?.address`. */
  clientAddress?: string;
  /**
   * Port the request was received on, normally `server.port`. Used for the
   * `localhost` origin that replaces a `Host` header not listed in
   * `security.allowedDomains`, and for the address Astro's image endpoint
   * loads local sources from. Defaults to Astro's configured `server.port`.
   */
  serverPort?: number;
  /** Values exposed as `Astro.locals`. */
  locals?: object;
}

export type RequestHandler = (
  request: Request,
  context?: BunRequestContext,
) => Promise<Response>;

export type BunAppHeadersJson = {
  pathname: string;
  headers: { key: string; value: string }[];
}[];

export type VitePlugin = NonNullable<AstroConfig["vite"]["plugins"]>[number];
