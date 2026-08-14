import { describe, expect, test } from "bun:test";

import {
  applyForwardedOrigin,
  resolveClientAddress,
} from "../../src/serve-app.ts";

const trustedPeer = "10.0.0.1";
const trusted = [trustedPeer];

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
  test("leaves the request unchanged when the peer is untrusted", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(applyForwardedOrigin(request, "198.51.100.1", trusted)).toBe(
      request,
    );
    expect(applyForwardedOrigin(request, undefined, trusted)).toBe(request);
    expect(applyForwardedOrigin(request, trustedPeer, [])).toBe(request);
  });

  test("does not let an untrusted peer downgrade a TLS request", () => {
    const request = new Request("https://cringe-o-meter.com/_image", {
      headers: { "x-forwarded-proto": "http" },
    });
    const incoming = applyForwardedOrigin(request, "198.51.100.1", trusted);
    expect(incoming).toBe(request);
    expect(incoming.url).toBe("https://cringe-o-meter.com/_image");
  });

  test("upgrades the request scheme from a trusted peer", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: { "x-forwarded-proto": "https" },
    });
    const incoming = applyForwardedOrigin(request, trustedPeer, trusted);
    expect(incoming.url).toBe("https://cringe-o-meter.com/_image");
  });

  test("uses the first hop and ignores X-Forwarded-Host", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: {
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "evil.example",
      },
    });
    const incoming = applyForwardedOrigin(request, trustedPeer, trusted);
    expect(incoming.url).toBe("https://cringe-o-meter.com/_image");
  });

  test("leaves the request unchanged without a valid forwarded protocol", () => {
    const request = new Request("http://cringe-o-meter.com/_image", {
      headers: { "x-forwarded-proto": "ftp" },
    });
    expect(applyForwardedOrigin(request, trustedPeer, trusted)).toBe(request);
  });

  test("preserves the request body after rewriting the scheme", async () => {
    const request = new Request("http://cringe-o-meter.com/api/echo", {
      method: "POST",
      headers: { "x-forwarded-proto": "https" },
      body: "request body",
    });
    const incoming = applyForwardedOrigin(request, trustedPeer, trusted);
    expect(incoming.url).toBe("https://cringe-o-meter.com/api/echo");
    expect(await incoming.text()).toBe("request body");
  });
});
