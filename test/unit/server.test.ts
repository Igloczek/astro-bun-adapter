import { connect } from "node:http2";
import net from "node:net";

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

  // oven-sh/bun#42844: on Bun 1.4.1-1.4.2 a streamed response finished after a
  // client WINDOW_UPDATE leaked its request, so graceful stop() never resolved.
  test.skipIf(!Bun.semver.satisfies(Bun.version, ">=1.4.3"))(
    "releases HTTP/2 streams finished after a client WINDOW_UPDATE",
    async () => {
      const server = createServer(
        async () =>
          new Response(
            new ReadableStream({
              async pull(controller) {
                controller.enqueue(
                  new TextEncoder().encode("streamed-past-the-window"),
                );
                controller.close();
              },
            }),
          ),
        "127.0.0.1",
        0,
        { http2: true, reusePort: false },
      );
      servers.push(server);

      const frame = (
        type: number,
        flags: number,
        streamId: number,
        payload = Buffer.alloc(0),
      ) => {
        const header = Buffer.alloc(9);
        header.writeUIntBE(payload.length, 0, 3);
        header[3] = type;
        header[4] = flags;
        header.writeUInt32BE(streamId, 5);
        return Buffer.concat([header, payload]);
      };
      const socket = net.connect(server.port, "127.0.0.1");
      let body = "";
      await new Promise<void>((resolve, reject) => {
        let pending = Buffer.alloc(0);
        let windowUpdated = false;
        socket.on("error", reject);
        socket.on("connect", () => {
          // SETTINGS_INITIAL_WINDOW_SIZE = 4, then GET / on stream 1.
          const settings = Buffer.alloc(6);
          settings.writeUInt16BE(4);
          settings.writeUInt32BE(4, 2);
          const authority = Buffer.from(`127.0.0.1:${server.port}`);
          const headers = Buffer.concat([
            Buffer.from([0x82, 0x86, 0x84, 0x01, authority.length]),
            authority,
          ]);
          socket.write(
            Buffer.concat([
              Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"),
              frame(4, 0, 0, settings),
              frame(1, 5, 1, headers),
            ]),
          );
        });
        socket.on("data", (chunk: Buffer) => {
          pending = Buffer.concat([pending, chunk]);
          while (pending.length >= 9) {
            const length = pending.readUIntBE(0, 3);
            if (pending.length < 9 + length) break;
            const type = pending[3]!;
            const flags = pending[4]!;
            const payload = pending.subarray(9, 9 + length);
            pending = pending.subarray(9 + length);
            if (type === 4 && !(flags & 1)) socket.write(frame(4, 1, 0));
            if (type === 0) {
              body += payload.toString();
              if (!windowUpdated) {
                windowUpdated = true;
                const increment = Buffer.alloc(4);
                increment.writeUInt32BE(1024);
                socket.write(frame(8, 0, 1, increment));
              }
            }
            if ((type === 0 || type === 1) && flags & 1) resolve();
          }
        });
      });
      await Bun.sleep(50);
      expect(body).toBe("streamed-past-the-window");
      expect(server.server.pendingRequests).toBe(0);

      socket.destroy();
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
