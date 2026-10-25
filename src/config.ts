import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

import { AstroError } from "astro/errors";

import type { Options, TlsOptions, UserOptions } from "./types.js";

export const PACKAGE_NAME = "@igloczek/astro-bun-adapter";
export const DEFAULT_REUSE_PORT = false;

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

export function isWorkerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function validateWorkers(value: unknown) {
  if (value !== undefined && !isWorkerCount(value)) {
    optionError("'workers' must be a positive integer.");
  }
}

function validateBeforeStart(value: unknown) {
  if (value !== undefined && (typeof value !== "string" || value === "")) {
    optionError("'beforeStart' must be a non-empty module path.");
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

function normalizeTls(value: TlsOptions | undefined) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "object" ||
    typeof value.certPath !== "string" ||
    value.certPath.length === 0 ||
    typeof value.keyPath !== "string" ||
    value.keyPath.length === 0 ||
    (value.caPath !== undefined &&
      (typeof value.caPath !== "string" || value.caPath.length === 0)) ||
    (value.serverName !== undefined &&
      (typeof value.serverName !== "string" || value.serverName.length === 0))
  ) {
    optionError("'tls' requires non-empty certPath and keyPath strings.");
  }
  return { ...value };
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
  validateWorkers(userOptions.workers);
  validateBeforeStart(userOptions.beforeStart);

  const bodySizeLimit = normalizeBodySizeLimit(userOptions.bodySizeLimit);
  const idleTimeout = normalizeIdleTimeout(userOptions.idleTimeout);
  const tls = normalizeTls(userOptions.tls);
  return {
    ...userOptions,
    ...(bodySizeLimit === undefined ? {} : { bodySizeLimit }),
    ...(idleTimeout === undefined ? {} : { idleTimeout }),
    ...(tls === undefined ? {} : { tls }),
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
    ...(beforeStart === undefined
      ? {}
      : { beforeStart: fileURLToPath(new URL(beforeStart, astroConfig.root)) }),
    client,
    experimentalDisableStreaming:
      userOptions.experimentalDisableStreaming ?? false,
    host: astroConfig.server.host,
    port: astroConfig.server.port,
    reusePort: userOptions.reusePort ?? DEFAULT_REUSE_PORT,
    server,
    staticHeaders: userOptions.staticHeaders ?? false,
    trustedProxies: userOptions.trustedProxies ?? [],
    workers: userOptions.workers ?? 1,
  };
}
