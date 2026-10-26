// Values and environment checks shared with the public supervisor module,
// which runs in a process that must not load Astro or the app: this module
// imports nothing from Astro.
import type { Options } from "./types.js";

export const PACKAGE_NAME = "@igloczek/astro-bun-adapter";
export const DEFAULT_REUSE_PORT = false;
/** Internal deadline inherited by workers for cleanup after supervisor loss. */
export const SUPERVISOR_SHUTDOWN_TIMEOUT_ENV =
  "ASTRO_BUN_SUPERVISOR_SHUTDOWN_TIMEOUT";
/** Seconds a stopping server gets to finish in-flight requests. */
export const DEFAULT_SHUTDOWN_TIMEOUT = 60;
/** The longest delay a timer supports (2^31 - 1 ms), in whole seconds. */
export const MAX_SHUTDOWN_TIMEOUT = Math.floor((2 ** 31 - 1) / 1000);

export function isShutdownTimeout(value: unknown): value is number {
  return (
    typeof value === "number" && value >= 0 && value <= MAX_SHUTDOWN_TIMEOUT
  );
}

export const TLS_REMOVED_MESSAGE =
  "Native TLS was removed in 1.0.0. Terminate TLS at a reverse proxy (Caddy, Traefik, nginx, a load balancer) and keep `X-Forwarded-Proto` for the public scheme.";

export const hostOptions = (host: string | boolean) => {
  if (typeof host === "boolean") return host ? "0.0.0.0" : "localhost";
  return host;
};

export function runtimePort(options: Pick<Options, "port">) {
  const value = process.env.PORT;
  const port = value === undefined ? (options.port ?? 8080) : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `[${PACKAGE_NAME}] PORT must be an integer from 0 through 65535.`,
    );
  }
  return port;
}

const REMOVED_TLS_ENV = [
  "SERVER_CERT_PATH",
  "SERVER_KEY_PATH",
  "SERVER_CA_PATH",
  "SERVER_KEY_PASSPHRASE",
];

/** Refuse to start in plaintext when a deployment still expects native TLS. */
export function rejectRemovedTlsEnv() {
  const configured = REMOVED_TLS_ENV.filter((name) => process.env[name]);
  if (configured.length) {
    throw new Error(
      `[${PACKAGE_NAME}] ${configured.join(", ")} ${configured.length === 1 ? "is" : "are"} set, but ${TLS_REMOVED_MESSAGE}`,
    );
  }
}
