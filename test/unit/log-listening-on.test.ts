import { describe, expect, test } from "bun:test";

import type { AstroIntegrationLogger } from "astro";

import { logListeningOn } from "../../src/log-listening-on.ts";

function listeningMessage(configuredHost: string | boolean | undefined) {
  const messages: string[] = [];
  const logger = {
    info: (message: string) => messages.push(message),
  } as unknown as AstroIntegrationLogger;
  const server = { protocol: "http", port: 4321 } as ReturnType<
    typeof Bun.serve
  >;
  logListeningOn(logger, server, configuredHost);
  return messages[0];
}

describe("listening log", () => {
  test("prints a usable URL for each kind of host", () => {
    expect(listeningMessage(undefined)).toBe(
      "Server listening on http://localhost:4321",
    );
    expect(listeningMessage(true)).toBe(
      "Server listening on http://localhost:4321",
    );
    expect(listeningMessage("::")).toBe(
      "Server listening on http://localhost:4321",
    );
    expect(listeningMessage("127.0.0.1")).toBe(
      "Server listening on http://127.0.0.1:4321",
    );
    expect(listeningMessage("example.test")).toBe(
      "Server listening on http://example.test:4321",
    );
  });

  test("brackets IPv6 addresses", () => {
    expect(listeningMessage("::1")).toBe(
      "Server listening on http://[::1]:4321",
    );
    expect(listeningMessage("fd00::5")).toBe(
      "Server listening on http://[fd00::5]:4321",
    );
  });
});
