import { connect } from "node:http2";

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

  test.skipIf(!Bun.semver.satisfies(Bun.version, ">=1.4.3"))(
    "serves HTTP/2 and HTTP/1.1 on one port when http2 is enabled",
    async () => {
      const server = createServer(
        async () => new Response("ok"),
        "127.0.0.1",
        0,
        { http2: true, reusePort: false },
      );
      servers.push(server);

      const httpVersion = async (...args: string[]) => {
        const curl = Bun.spawn([
          "curl",
          "-s",
          "-m",
          "5",
          "-o",
          "/dev/null",
          "-w",
          "%{http_version}",
          ...args,
          `http://127.0.0.1:${server.port}/`,
        ]);
        return new Response(curl.stdout).text();
      };
      expect(await httpVersion("--http2-prior-knowledge")).toBe("2");
      expect(await httpVersion("--http1.1")).toBe("1.1");
    },
  );

  test.skipIf(!Bun.semver.satisfies(Bun.version, ">=1.4.3"))(
    "drains streamed HTTP/2 responses under client flow control",
    async () => {
      const chunk = new Uint8Array(16 * 1024).fill(97);
      const server = createServer(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (let index = 0; index < 16; index += 1) {
                  controller.enqueue(chunk);
                }
                controller.close();
              },
            }),
          ),
        "127.0.0.1",
        0,
        { http2: true, reusePort: false },
      );
      servers.push(server);

      const client = connect(`http://127.0.0.1:${server.port}`, {
        settings: { initialWindowSize: 1024 },
      });
      const received = await new Promise<number>((resolve, reject) => {
        let length = 0;
        const stream = client.request({ ":path": "/" });
        stream.on("data", (data: Buffer) => (length += data.length));
        stream.on("end", () => resolve(length));
        stream.on("error", reject);
        stream.end();
      });
      client.close();
      expect(received).toBe(16 * chunk.length);

      const stopped = await Promise.race([
        server.stop().then(() => true),
        Bun.sleep(2_000).then(() => false),
      ]);
      expect(stopped).toBe(true);
    },
  );

  test.skipIf(Bun.semver.satisfies(Bun.version, ">=1.4.3"))(
    "refuses http2 on Bun releases without HTTP/2 support",
    () => {
      expect(() =>
        createServer(async () => new Response("ok"), "127.0.0.1", 0, {
          http2: true,
          reusePort: false,
        }),
      ).toThrow("http2");
    },
  );

  test("rejects partial runtime TLS configuration before listening", () => {
    process.env.SERVER_CERT_PATH = "cert.pem";
    expect(() =>
      createServer(async () => new Response(), "127.0.0.1", 0, {
        reusePort: false,
      }),
    ).toThrow("TLS requires both");
  });
});
