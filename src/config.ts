import { isIP } from "node:net";

import { AstroError } from "astro/errors";

import {
  DEFAULT_REUSE_PORT,
  DEFAULT_SHUTDOWN_TIMEOUT,
  isShutdownTimeout,
  MAX_SHUTDOWN_TIMEOUT,
  PACKAGE_NAME,
  TLS_REMOVED_MESSAGE,
} from "./runtime-env.js";
import type { Options, UserOptions } from "./types.js";

export {
  DEFAULT_REUSE_PORT,
  DEFAULT_SHUTDOWN_TIMEOUT,
  isShutdownTimeout,
  MAX_SHUTDOWN_TIMEOUT,
  PACKAGE_NAME,
  TLS_REMOVED_MESSAGE,
};

function optionError(message: string): never {
  throw new AstroError(`[${PACKAGE_NAME}] ${message}`);
}

function validateOptionalBoolean(name: string, value: unknown) {
  if (value !== undefined && typeof value !== "boolean") {
    optionError(`'${name}' must be a boolean.`);
  }
}

export function normalizeBodySizeLimit(value: number | undefined) {
  if (value === undefined) return undefined;
  if (value === 0 || value === Number.POSITIVE_INFINITY) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    optionError(
      "'bodySizeLimit' must be a positive safe integer, 0, or Infinity.",
    );
  }
  return value;
}

export function normalizeIdleTimeout(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    optionError("'idleTimeout' must be an integer from 0 through 255.");
  }
  return value;
}

function validateShutdownTimeout(value: unknown) {
  if (value !== undefined && !isShutdownTimeout(value)) {
    optionError(
      `'shutdownTimeout' must be a number of seconds from 0 through ${MAX_SHUTDOWN_TIMEOUT}.`,
    );
  }
}

function normalizeTrustedProxies(value: string[] | undefined) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((address) => isIP(address) === 0)) {
    optionError(
      "'trustedProxies' must contain only valid IPv4 or IPv6 addresses.",
    );
  }
  return [...new Set(value)];
}

export function normalizeUserOptions(userOptions: UserOptions): UserOptions {
  if (!userOptions || typeof userOptions !== "object") {
    optionError("Adapter options are required.");
  }
  if (userOptions.mode !== "middleware" && userOptions.mode !== "standalone") {
    optionError("'mode' must be 'middleware' or 'standalone'.");
  }

  validateOptionalBoolean(
    "experimentalDisableStreaming",
    userOptions.experimentalDisableStreaming,
  );
  validateOptionalBoolean("staticHeaders", userOptions.staticHeaders);
  validateOptionalBoolean("reusePort", userOptions.reusePort);
  validateShutdownTimeout(userOptions.shutdownTimeout);

  const bodySizeLimit = normalizeBodySizeLimit(userOptions.bodySizeLimit);
  const idleTimeout = normalizeIdleTimeout(userOptions.idleTimeout);
  if ("tls" in userOptions)
    optionError(`'tls' is no longer supported. ${TLS_REMOVED_MESSAGE}`);
  for (const name of ["workers", "beforeStart"]) {
    if (name in userOptions) {
      optionError(
        `'${name}' was removed in 1.2.0. Start several processes, and run setup before them, from your own supervisor script with \`supervise()\` from "${PACKAGE_NAME}/supervisor".`,
      );
    }
  }
  return {
    ...userOptions,
    ...(bodySizeLimit === undefined ? {} : { bodySizeLimit }),
    ...(idleTimeout === undefined ? {} : { idleTimeout }),
    trustedProxies: normalizeTrustedProxies(userOptions.trustedProxies),
  };
}

export function runtimeOptions(
  userOptions: UserOptions,
  astroConfig: import("astro").AstroConfig,
): Options {
  const client = astroConfig.build.client?.toString();
  const server = astroConfig.build.server?.toString();
  if (!client || !server) {
    optionError("Astro did not provide build.client and build.server URLs.");
  }

  return {
    ...userOptions,
    client,
    experimentalDisableStreaming:
      userOptions.experimentalDisableStreaming ?? false,
    host: astroConfig.server.host,
    port: astroConfig.server.port,
    reusePort: userOptions.reusePort ?? DEFAULT_REUSE_PORT,
    server,
    shutdownTimeout: userOptions.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT,
    staticHeaders: userOptions.staticHeaders ?? false,
    trustedProxies: userOptions.trustedProxies ?? [],
  };
}
