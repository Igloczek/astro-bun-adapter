import { afterEach, describe, expect, test } from "bun:test";

import { createServer } from "../../src/standalone.ts";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  delete process.env.SERVER_CERT_PATH;
  delete process.env.SERVER_KEY_PATH;
});

describe("native Bun server", () => {
  test("starts, responds, and stops idempotently", async () => {
    const server = createServer(
      async () => new Response("ok"),
      "127.0.0.1",
      0,
      { reusePort: false },
    );
    servers.push(server);

    expect(await fetch(`http://127.0.0.1:${server.port}`)).toHaveProperty(
      "status",
      200,
    );
    await Promise.all([server.stop(), server.stop()]);
    await expect(server.closed()).resolves.toBeUndefined();
  });

  test("waits for an in-flight response during graceful shutdown", async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => (started = resolve));
    const responseReleased = new Promise<void>(
      (resolve) => (release = resolve),
    );
    const server = createServer(
      async () => {
        started?.();
        await responseReleased;
        return new Response("finished");
      },
      "127.0.0.1",
      0,
      { reusePort: false },
    );
    servers.push(server);

    const response = fetch(`http://127.0.0.1:${server.port}`);
    await requestStarted;
    const stopping = server.stop();
    release?.();
    expect(await (await response).text()).toBe("finished");
    await stopping;
  });

  test("rejects partial runtime TLS configuration before listening", () => {
    process.env.SERVER_CERT_PATH = "cert.pem";
    expect(() =>
      createServer(async () => new Response(), "127.0.0.1", 0, {
        reusePort: false,
      }),
    ).toThrow("TLS requires both");
  });
});
