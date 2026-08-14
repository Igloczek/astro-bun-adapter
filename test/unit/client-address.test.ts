import { describe, expect, test } from "bun:test";

import {
  applyForwardedOrigin,
  resolveClientAddress,
} from "../../src/serve-app.ts";

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

describe("forwarded origin", () => {
  test("upgrades the request scheme from X-Forwarded-Proto", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(applyForwardedOrigin(request).url).toBe(
      "https://cringe-o-meter.com/_image",
    );
  });

  test("applies proto without a trusted proxy allowlist", () => {
    const request = new Request(
      "http://cringe-o-meter.com/_image?href=%2F_astro%2Flogo.png",
      { headers: { "x-forwarded-proto": "https" } },
    );
    expect(applyForwardedOrigin(request).url).toBe(
      "https://cringe-o-meter.com/_image?href=%2F_astro%2Flogo.png",
    );
  });

  test("uses the first hop and ignores X-Forwarded-Host", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: {
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "evil.example",
      },
    });
    expect(applyForwardedOrigin(request).url).toBe(
      "https://cringe-o-meter.com/_image",
    );
  });

  test("leaves the request unchanged without a valid forwarded protocol", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: { "x-forwarded-proto": "ftp" },
    });
    expect(applyForwardedOrigin(request)).toBe(request);
  });

  test("preserves the request body after rewriting the scheme", async () => {
    const request = new Request("http://cringe-o-meter.com/api/echo", {
      method: "POST",
      headers: { "x-forwarded-proto": "https" },
      body: "request body",
    });
    const incoming = applyForwardedOrigin(request);
    expect(incoming.url).toBe("https://cringe-o-meter.com/api/echo");
    expect(await incoming.text()).toBe("request body");
  });
});
