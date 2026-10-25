import { describe, expect, test } from "bun:test";

import {
  applyForwardedOrigin,
  applyImageEndpointOrigin,
  applyTrustedHost,
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

describe("image endpoint origin", () => {
  const imageRequest = (url: string) =>
    new Request(url, {
      headers: {
        cookie: "session=1",
        "x-forwarded-host": "example.com",
        "x-forwarded-proto": "https",
      },
    });
  const server = new URL("http://evil.example:9999/");

  test("loads sources from this server when the Host is not trusted", () => {
    const result = applyImageEndpointOrigin(
      imageRequest("https://evil.example:9999/_image?href=%2Fa.png&w=1"),
      server,
      "0.0.0.0",
      4321,
      false,
    );
    // The listening protocol and address, not X-Forwarded-Proto or Host.
    expect(result.url).toBe("http://127.0.0.1:4321/_image?href=%2Fa.png&w=1");
    expect(result.headers.get("cookie")).toBe("session=1");
    // Astro must not re-apply forwarded origin headers to the rewritten URL.
    expect(result.headers.get("x-forwarded-host")).toBeNull();
    expect(result.headers.get("x-forwarded-proto")).toBeNull();
  });

  test("keeps a Host listed in security.allowedDomains", () => {
    const request = imageRequest("https://example.com/_image?href=%2Fa.png");
    expect(
      applyImageEndpointOrigin(request, server, "0.0.0.0", 4321, true),
    ).toBe(request);
  });

  test("maps listening hosts to addresses the server can reach", () => {
    const origin = (host: string | boolean) =>
      new URL(
        applyImageEndpointOrigin(
          imageRequest("http://evil.example/_image"),
          server,
          host,
          8080,
          false,
        ).url,
      ).host;
    expect(origin(false)).toBe("localhost:8080");
    expect(origin(true)).toBe("127.0.0.1:8080");
    expect(origin("::")).toBe("[::1]:8080");
    expect(origin("10.0.0.5")).toBe("10.0.0.5:8080");
    expect(origin("fd00::5")).toBe("[fd00::5]:8080");
  });
});

describe("Host validation", () => {
  const allowlist = [{ hostname: "example.com" }];

  test("leaves the Host untouched without an allowlist", () => {
    const request = new Request("https://evil.example/");
    for (const allowedDomains of [undefined, []]) {
      expect(applyTrustedHost(request, allowedDomains, false, 8080)).toBe(
        request,
      );
    }
  });

  test("keeps a trusted Host", () => {
    const request = new Request("https://example.com/path?q=1");
    expect(applyTrustedHost(request, allowlist, true, 8080)).toBe(request);
  });

  test("replaces an untrusted Host with localhost", () => {
    const request = new Request("https://evil.example:9999/path?q=1", {
      method: "POST",
      body: "body",
    });
    const result = applyTrustedHost(request, allowlist, false, 8080);
    expect(result.url).toBe("https://localhost:8080/path?q=1");
    expect(result.method).toBe("POST");
  });
});
