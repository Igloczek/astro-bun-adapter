import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = path.join(root, "test/fixture");
const temporary = await mkdtemp(
  path.join(os.tmpdir(), "astro-bun-integration-"),
);
const site = path.join(temporary, "site");
const archive = path.join(temporary, "adapter.tgz");

async function run(
  command: string[],
  cwd: string,
  environment: Record<string, string> = {},
) {
  const process = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env, ...environment },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;
  assert.equal(exitCode, 0, `${command.join(" ")} exited with ${exitCode}`);
}

async function readFirstLine(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let value = "";
  while (!value.includes("\n")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    value += decoder.decode(chunk.value, { stream: true });
  }
  reader.releaseLock();
  return value.split("\n", 1)[0] ?? "";
}

async function startRunner(mode: "middleware" | "standalone", entry: string) {
  const process = Bun.spawn(["bun", "runner.ts"], {
    cwd: site,
    env: {
      ...Bun.env,
      ADAPTER_MODE: mode,
      HOST: "127.0.0.1",
      PORT: "0",
      SERVER_ENTRY: entry,
    },
    stdout: "pipe",
    stderr: "inherit",
  });
  const firstLine = await readFirstLine(process.stdout);
  const { port } = JSON.parse(firstLine) as { port: number };
  assert.ok(port > 0, `runner did not report a valid port: ${firstLine}`);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      process.kill("SIGTERM");
      assert.equal(await process.exited, 0);
    },
  };
}

async function reservePort() {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = server.port;
  await server.stop(true);
  assert.ok(port);
  return port;
}

async function waitFor(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(50);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function testPreview() {
  const port = await reservePort();
  const process = Bun.spawn(
    [
      "bunx",
      "--bun",
      "astro",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: site,
      env: { ...Bun.env, ADAPTER_MODE: "standalone" },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const response = await waitFor(`http://127.0.0.1:${port}/`);
  assert.equal(response.headers.get("x-adapter-preview"), "active");
  process.kill("SIGTERM");
  assert.ok([0, 143].includes(await process.exited));
}

async function hashedPixelHref(clientDir: string) {
  const files = await readdir(path.join(clientDir, "_astro"));
  const pixel = files.find(
    (name) => name.startsWith("pixel.") && name.endsWith(".png"),
  );
  assert.ok(pixel, `hashed pixel asset missing in ${clientDir}`);
  return `/_astro/${pixel}`;
}

function assertPng(bytes: Uint8Array, width: number, height: number) {
  assert.ok(bytes.byteLength >= 24, "image response is too small");
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "image response is not a PNG",
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(16), width);
  assert.equal(view.getUint32(20), height);
}

async function assertImageLoads(baseUrl: string, href: string) {
  const url = new URL("/_image", baseUrl);
  url.searchParams.set("href", href);
  url.searchParams.set("w", "1");
  url.searchParams.set("h", "1");
  url.searchParams.set("f", "png");
  const response = await fetch(url);
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200, `/_image returned ${response.status}`);
  assertPng(body, 1, 1);
}

async function rawStatus(port: number, requestPath: string) {
  return new Promise<number>((resolve, reject) => {
    let response = "";
    const decoder = new TextDecoder();
    void Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(socket) {
          socket.write(
            `GET ${requestPath} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
          );
        },
        data(socket, data) {
          response += decoder.decode(data, { stream: true });
          const match = /^HTTP\/1\.[01] (\d{3})/.exec(response);
          if (match?.[1]) {
            socket.terminate();
            resolve(Number(match[1]));
          }
        },
        error(_socket, error) {
          reject(error);
        },
        close() {
          const match = /^HTTP\/1\.[01] (\d{3})/.exec(response);
          if (match?.[1]) resolve(Number(match[1]));
          else
            reject(
              new Error("Connection closed before an HTTP status was received"),
            );
        },
      },
    }).catch(reject);
  });
}

async function testStandalone() {
  const built = path.join(site, "dist");
  await symlink("../server/entry.mjs", path.join(built, "client/leak.mjs"));
  await testPreview();

  const relocated = path.join(site, "relocated-dist");
  await rename(built, relocated);
  const runner = await startRunner(
    "standalone",
    "relocated-dist/server/entry.mjs",
  );
  try {
    let response = await fetch(`${runner.baseUrl}/`, {
      headers: {
        "x-forwarded-for": "203.0.113.8",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(response.status, 200);
    const home = await response.text();
    assert.match(home, /data-address="203\.0\.113\.8"/);
    assert.match(home, /data-origin="https:\/\/127\.0\.0\.1:\d+"/);
    await assertImageLoads(
      runner.baseUrl,
      await hashedPixelHref(path.join(site, "relocated-dist/client")),
    );

    response = await fetch(`${runner.baseUrl}/session`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), />bun<\/body>/);

    response = await fetch(`${runner.baseUrl}/static`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /prerendered fixture/);
    assert.ok(response.headers.get("content-security-policy"));

    response = await fetch(`${runner.baseUrl}/range.txt`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.ok(Number(response.headers.get("content-length")) > 0);

    response = await fetch(`${runner.baseUrl}/range.txt`);
    const etag = response.headers.get("etag");
    assert.equal(response.status, 200);
    assert.ok(etag);
    assert.match(await response.text(), /^0123456789/);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { "if-none-match": etag! },
    });
    assert.equal(response.status, 304);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { "if-none-match": etag!.replace(/^W\//, "") },
    });
    assert.equal(response.status, 304);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: {
        "if-none-match": 'W/"stale"',
        "if-modified-since": new Date(Date.now() + 60_000).toUTCString(),
      },
    });
    assert.equal(response.status, 200);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { range: "bytes=0-3" },
    });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), "0123");

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { range: "bytes=-4" },
    });
    assert.equal(response.status, 206);
    assert.equal((await response.text()).length, 4);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { range: "bytes=999999-" },
    });
    assert.equal(response.status, 416);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { range: "bytes=0-1,3-4" },
    });
    assert.equal(response.status, 200);

    response = await fetch(`${runner.baseUrl}/range.txt`, {
      headers: { range: "bytes=0-3", "if-range": '"different"' },
    });
    assert.equal(response.status, 200);

    response = await fetch(`${runner.baseUrl}/range.txt`, { method: "POST" });
    assert.notEqual(
      await response.text(),
      "0123456789abcdefghijklmnopqrstuvwxyz\n",
    );

    assert.notEqual((await fetch(`${runner.baseUrl}/.secret`)).status, 200);
    assert.equal(
      (await fetch(`${runner.baseUrl}/.well-known/security.txt`)).status,
      200,
    );
    assert.notEqual((await fetch(`${runner.baseUrl}/leak.mjs`)).status, 200);

    const port = Number(new URL(runner.baseUrl).port);
    assert.notEqual(await rawStatus(port, "/%2e%2e%2fserver/entry.mjs"), 200);
  } finally {
    await runner.stop();
  }
}

async function testMiddleware() {
  const runner = await startRunner("middleware", "dist/server/entry.mjs");
  try {
    let response = await fetch(`${runner.baseUrl}/`, {
      headers: {
        "x-forwarded-for": "198.51.100.9",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /data-address="198\.51\.100\.9"/);
    assert.match(html, /data-message="middleware"/);
    assert.match(html, /data-origin="https:\/\/127\.0\.0\.1:\d+"/);

    response = await fetch(`${runner.baseUrl}/api/echo`, {
      method: "POST",
      headers: {
        origin: runner.baseUrl.replace(/^http:/, "https:"),
        "x-forwarded-for": "198.51.100.9",
        "x-forwarded-proto": "https",
      },
      body: "request body",
    });
    if (response.status !== 200) {
      throw new Error(
        `Middleware endpoint returned ${response.status}: ${await response.text()}`,
      );
    }
    assert.deepEqual(await response.json(), {
      address: "198.51.100.9",
      body: "request body",
      message: "middleware",
    });
  } finally {
    await runner.stop();
  }
}

try {
  await run(["bun", "run", "build"], root);
  await mkdir(site, { recursive: true });
  await run(
    ["bun", "pm", "pack", "--filename", archive, "--ignore-scripts", "--quiet"],
    root,
  );
  await cp(fixture, site, { recursive: true });
  const astroVersion = process.env.ASTRO_VERSION ?? "7.1.6";
  await writeFile(
    path.join(site, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@igloczek/astro-bun-adapter": `file:${archive}`,
          astro: astroVersion,
        },
        devDependencies: { "@types/bun": "1.3.14" },
      },
      null,
      2,
    ),
  );
  await run(["bun", "install"], site);

  await run(["bunx", "astro", "build"], site, { ADAPTER_MODE: "standalone" });
  const headers = JSON.parse(
    await readFile(path.join(site, "dist/_headers.json"), "utf8"),
  ) as unknown[];
  assert.ok(headers.length > 0, "Astro did not emit static CSP headers");
  await testStandalone();

  await run(["bunx", "astro", "build"], site, { ADAPTER_MODE: "middleware" });
  await testMiddleware();

  console.log(`Integration passed with Astro ${astroVersion}`);
} finally {
  if (process.env.KEEP_INTEGRATION_FIXTURE)
    console.log(`Fixture kept at ${temporary}`);
  else await rm(temporary, { recursive: true, force: true });
}
