import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

import { AstroError } from "astro/errors";

import type { Options, UserOptions } from "./types.js";

export const PACKAGE_NAME = "@igloczek/astro-bun-adapter";
export const DEFAULT_REUSE_PORT = false;
/** Seconds a stopping server gets to finish in-flight requests. */
export const DEFAULT_SHUTDOWN_TIMEOUT = 10;

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

export function isShutdownTimeout(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isWorkerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function validateWorkers(value: unknown) {
  if (value !== undefined && !isWorkerCount(value)) {
    optionError("'workers' must be a positive integer.");
  }
}

function validateShutdownTimeout(value: unknown) {
  if (value !== undefined && !isShutdownTimeout(value)) {
    optionError("'shutdownTimeout' must be a non-negative number of seconds.");
  }
}

function validateBeforeStart(value: unknown) {
  const modules = Array.isArray(value) ? value : [value];
  if (
    value !== undefined &&
    modules.some((module) => typeof module !== "string" || module === "")
  ) {
    optionError(
      "'beforeStart' must be a module specifier or an array of them.",
    );
  }
}

function resolveModule(specifier: string, root: URL) {
  // Relative paths, with either slash, are from the project root; Vite
  // resolves the rest.
  return /^\.\.?[\\/]/.test(specifier)
    ? fileURLToPath(new URL(specifier.replaceAll("\\", "/"), root))
    : specifier;
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

export const TLS_REMOVED_MESSAGE =
  "Native TLS was removed in 1.0.0. Terminate TLS at a reverse proxy (Caddy, Traefik, nginx, a load balancer) and keep `X-Forwarded-Proto` for the public scheme.";

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
  validateWorkers(userOptions.workers);
  validateShutdownTimeout(userOptions.shutdownTimeout);
  validateBeforeStart(userOptions.beforeStart);

  const bodySizeLimit = normalizeBodySizeLimit(userOptions.bodySizeLimit);
  const idleTimeout = normalizeIdleTimeout(userOptions.idleTimeout);
  if ("tls" in userOptions)
    optionError(`'tls' is no longer supported. ${TLS_REMOVED_MESSAGE}`);
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

  const { beforeStart, ...rest } = userOptions;
  return {
    ...rest,
    beforeStart: [beforeStart ?? []]
      .flat()
      .map((module) => resolveModule(module, astroConfig.root)),
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
    workers: userOptions.workers ?? 1,
  };
}
