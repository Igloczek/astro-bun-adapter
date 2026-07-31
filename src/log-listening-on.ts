import type { AstroIntegrationLogger } from "astro";

export function logListeningOn(
  logger: AstroIntegrationLogger,
  server: ReturnType<typeof Bun.serve>,
  configuredHost: string | boolean | undefined,
) {
  const host =
    typeof configuredHost === "boolean"
      ? configuredHost
        ? "0.0.0.0"
        : "localhost"
      : (configuredHost ?? "0.0.0.0");
  const printableHost =
    host === "0.0.0.0" || host === "::" ? "localhost" : host;
  logger.info(
    `Server listening on ${server.protocol ?? "http"}://${printableHost}:${server.port}`,
  );
}
