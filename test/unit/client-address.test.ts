import { describe, expect, test } from "bun:test";

import { resolveClientAddress } from "../../src/serve-app.ts";

describe("trusted proxies", () => {
  test("ignores forged forwarding headers from an untrusted peer", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    expect(resolveClientAddress(request, "198.51.100.1", [])).toBe(
      "198.51.100.1",
    );
  });

  test("selects the last untrusted hop behind a trusted proxy chain", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "192.0.2.99, 203.0.113.8, 10.0.0.2",
      },
    });
    expect(
      resolveClientAddress(request, "10.0.0.1", ["10.0.0.1", "10.0.0.2"]),
    ).toBe("203.0.113.8");
  });

  test("falls back to the peer when the forwarding chain is malformed", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "not-an-ip" },
    });
    expect(resolveClientAddress(request, "10.0.0.1", ["10.0.0.1"])).toBe(
      "10.0.0.1",
    );
  });
});
