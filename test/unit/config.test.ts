import { describe, expect, test } from "bun:test";

import {
  DEFAULT_REUSE_PORT,
  normalizeBodySizeLimit,
  normalizeIdleTimeout,
  normalizeUserOptions,
  runtimeOptions,
} from "../../src/config.ts";

describe("adapter options", () => {
  test("preserves Bun defaults unless explicitly configured", () => {
    expect(DEFAULT_REUSE_PORT).toBe(false);
    expect(normalizeBodySizeLimit(undefined)).toBeUndefined();
    expect(normalizeIdleTimeout(undefined)).toBeUndefined();
  });

  test("normalizes documented unlimited body sizes", () => {
    expect(normalizeBodySizeLimit(0)).toBe(Number.MAX_SAFE_INTEGER);
    expect(normalizeBodySizeLimit(Number.POSITIVE_INFINITY)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  test("rejects unsafe runtime values", () => {
    for (const value of [-1, 1.5, Number.NaN]) {
      expect(() => normalizeBodySizeLimit(value)).toThrow("bodySizeLimit");
    }
    for (const value of [-1, 1.5, 256]) {
      expect(() => normalizeIdleTimeout(value)).toThrow("idleTimeout");
    }
    expect(() => normalizeUserOptions({ mode: "invalid" } as never)).toThrow(
      "mode",
    );
    expect(() =>
      normalizeUserOptions({ mode: "standalone", trustedProxies: ["host"] }),
    ).toThrow("trustedProxies");
    expect(() =>
      normalizeUserOptions({
        mode: "standalone",
        tls: { certPath: "", keyPath: "key.pem" },
      }),
    ).toThrow("tls");
    for (const workers of [0, 1.5, "2"]) {
      expect(() =>
        normalizeUserOptions({ mode: "standalone", workers } as never),
      ).toThrow("'workers' must be a positive integer");
    }
    expect(normalizeUserOptions({ mode: "middleware", workers: 2 })).toEqual(
      expect.objectContaining({ workers: 2 }),
    );
    for (const beforeStart of ["", 1, ["./ok.ts", ""]]) {
      expect(() =>
        normalizeUserOptions({ mode: "standalone", beforeStart } as never),
      ).toThrow("beforeStart");
    }
  });

  test("resolves relative beforeStart modules against the project root", () => {
    const options = runtimeOptions(
      {
        mode: "standalone",
        beforeStart: [
          "./src/before-start.ts",
          "@shared/setup",
          "../x.ts",
          ".\\src\\windows.ts",
          "..\\y.ts",
        ],
      },
      {
        root: new URL("file:///project/"),
        build: {
          client: new URL("file:///project/dist/client/"),
          server: new URL("file:///project/dist/server/"),
        },
        server: { host: false, port: 4321 },
      } as never,
    );
    expect(options.beforeStart).toEqual([
      "/project/src/before-start.ts",
      "@shared/setup",
      "/x.ts",
      "/project/src/windows.ts",
      "/y.ts",
    ]);
    expect(options.workers).toBe(1);
  });
});
