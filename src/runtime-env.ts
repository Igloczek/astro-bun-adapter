// Environment checks the supervisor runs before any worker starts. This module
// must not import Astro's app runtime, which would load the app itself.
import { PACKAGE_NAME, TLS_REMOVED_MESSAGE } from "./config.js";
import type { Options } from "./types.js";

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
