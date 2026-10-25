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

async function rawRequest(
  port: number,
  requestPath: string,
  extraHeaders: Record<string, string> = {},
  host = "localhost",
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    let response = "";
    const decoder = new TextDecoder();
    const headers = [
      `GET ${requestPath} HTTP/1.1`,
      `Host: ${host}`,
      ...Object.entries(extraHeaders).map(
        ([name, value]) => `${name}: ${value}`,
      ),
      "Connection: close",
      "",
      "",
    ].join("\r\n");
    void Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(socket) {
          socket.write(headers);
        },
        data(_socket, data) {
          response += decoder.decode(data, { stream: true });
        },
        error(_socket, error) {
          reject(error);
        },
        close() {
          const match = /^HTTP\/1\.[01] (\d{3})/.exec(response);
          if (!match?.[1]) {
            reject(
              new Error("Connection closed before an HTTP status was received"),
            );
            return;
          }
          const split = response.indexOf("\r\n\r\n");
          resolve({
            status: Number(match[1]),
            body: split === -1 ? "" : response.slice(split + 4),
          });
        },
      },
    }).catch(reject);
  });
}

async function assertImageIgnoresHost(
  baseUrl: string,
  href: string,
  endpoint = "/_image",
) {
  const hits: string[] = [];
  const record = (request: Request) => {
    hits.push(request.url);
    return new Response("internal", { status: 200 });
  };
  // The forged Host targets a host no fixture allowlists. The forwarded host
  // targets 127.0.0.1, which some fixtures allowlist, so Astro would apply it
  // if the adapter left the forwarded headers in place.
  const internal = Bun.serve({ hostname: "localhost", port: 0, fetch: record });
  const forwarded = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: record,
  });
  try {
    const query = new URLSearchParams({ href, w: "1", h: "1", f: "png" });
    const { status } = await rawRequest(
      Number(new URL(baseUrl).port),
      `${endpoint}?${query}`,
      {
        "X-Forwarded-Host": `127.0.0.1:${forwarded.port}`,
        "X-Forwarded-Proto": "https",
      },
      `localhost:${internal.port}`,
    );
    assert.deepEqual(
      hits,
      [],
      `${endpoint} must not fetch local images from the request Host`,
    );
    assert.equal(status, 200, `${endpoint} returned ${status}`);
  } finally {
    await Promise.all([internal.stop(true), forwarded.stop(true)]);
  }
}

async function rawStatus(port: number, requestPath: string) {
  return (await rawRequest(port, requestPath)).status;
}

async function assertCoolifyOrigin(baseUrl: string) {
  const port = Number(new URL(baseUrl).port);
  const { status, body } = await rawRequest(
    port,
    "/",
    { "X-Forwarded-Proto": "https" },
    "cringe-o-meter.com",
  );
  assert.equal(status, 200);
  assert.match(
    body,
    /data-origin="https:\/\/cringe-o-meter.com"/,
    "Coolify-shaped request must rebuild https://cringe-o-meter.com, not http://",
  );
}

async function assertUntrustedHostIgnored(baseUrl: string) {
  const port = Number(new URL(baseUrl).port);
  const { status, body } = await rawRequest(port, "/", {}, "evil.example");
  assert.equal(status, 200);
  assert.match(
    body,
    new RegExp(`data-origin="http://localhost:${port}"`),
    "a Host outside security.allowedDomains must not control Astro.url",
  );
}

async function assertPrerenderedRouting(baseUrl: string) {
  let response = await fetch(`${baseUrl}/data/unknown.json`);
  assert.equal(
    response.status,
    404,
    "unknown params of a prerendered endpoint must 404, not 500",
  );

  response = await fetch(`${baseUrl}/fallback/other`);
  assert.equal(response.status, 200);
  assert.match(
    await response.text(),
    /on-demand other/,
    "a prerendered dynamic route must not shadow an on-demand fallback",
  );
}

async function testStandalone() {
  const built = path.join(site, "dist");
  await symlink("../server/entry.mjs", path.join(built, "client/leak.mjs"));
  await symlink("../server/entry.mjs", path.join(built, "client/leak.svg"));
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
    await assertCoolifyOrigin(runner.baseUrl);
    await assertUntrustedHostIgnored(runner.baseUrl);
    await assertPrerenderedRouting(runner.baseUrl);
    const pixelHref = await hashedPixelHref(
      path.join(site, "relocated-dist/client"),
    );
    await assertImageLoads(runner.baseUrl, pixelHref);
    await assertImageIgnoresHost(runner.baseUrl, pixelHref);
    // Sources rendered on demand are loaded through the server itself.
    await assertImageLoads(runner.baseUrl, "/api/pixel.png");
    await assertImageIgnoresHost(runner.baseUrl, "/api/pixel.png");
    await assertImageSymlinkContained(runner.baseUrl, "/leak.svg");

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

async function assertImageSymlinkContained(baseUrl: string, href: string) {
  const query = new URLSearchParams({ href, w: "1", h: "1", f: "svg" });
  const response = await fetch(`${baseUrl}/_image?${query}`);
  const body = await response.text();
  assert.notEqual(response.status, 200, "/_image followed a symlink out");
  assert.doesNotMatch(body, /startServer/, "/_image leaked server code");
}

async function testBasePathImages(base: string) {
  await symlink("../server/entry.mjs", path.join(site, "dist/client/leak.svg"));
  const runner = await startRunner("standalone", "dist/server/entry.mjs");
  try {
    const response = await fetch(`${runner.baseUrl}${base}`);
    assert.equal(response.status, 200);
    const src = /<img[^>]+src="([^"]+)"/.exec(await response.text())?.[1];
    assert.ok(
      src && src.startsWith(`${base}/images?`),
      `unexpected image URL ${src}`,
    );
    // Decode the HTML-escaped ampersands in one pass.
    const imageUrl = src.replace(/&(?:amp|#38);/g, "&");

    const image = await fetch(`${runner.baseUrl}${imageUrl}`);
    assert.equal(
      image.status,
      200,
      `${imageUrl} returned ${image.status} with a base and custom image route`,
    );
    assert.match(image.headers.get("content-type") ?? "", /^image\//);
    await assertImageIgnoresHost(
      runner.baseUrl,
      new URLSearchParams(imageUrl.split("?")[1]).get("href")!,
      `${base}/images`,
    );

    const query = new URLSearchParams({
      href: `${base}/leak.svg`,
      w: "1",
      h: "1",
      f: "svg",
    });
    const leak = await fetch(`${runner.baseUrl}${base}/images?${query}`);
    assert.notEqual(leak.status, 200, "image route followed a symlink out");
    assert.doesNotMatch(await leak.text(), /startServer/);
  } finally {
    await runner.stop();
  }
}

async function testResolvedImageRoute() {
  const runner = await startRunner("standalone", "dist/server/entry.mjs");
  try {
    // Astro serves image.endpoint.route "/images/index.ts" at /images.
    const href = await hashedPixelHref(path.join(site, "dist/client"));
    await assertImageIgnoresHost(runner.baseUrl, href, "/images");
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
    await assertCoolifyOrigin(runner.baseUrl);
    await assertUntrustedHostIgnored(runner.baseUrl);
    await assertPrerenderedRouting(runner.baseUrl);
    await assertImageLoads(runner.baseUrl, "/api/pixel.png");
    await assertImageIgnoresHost(runner.baseUrl, "/api/pixel.png");

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
  const { devDependencies } = (await Bun.file(
    path.join(root, "package.json"),
  ).json()) as { devDependencies: Record<string, string> };
  const astroVersion = process.env.ASTRO_VERSION ?? devDependencies.astro;
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
        devDependencies: { "@types/bun": "1.4.4" },
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

  await run(["bunx", "astro", "build"], site, {
    ADAPTER_MODE: "standalone",
    // A base containing "/_image" catches loaders that locate the base by
    // searching for the default endpoint name.
    FIXTURE_BASE: "/docs/_images",
    FIXTURE_IMAGE_ROUTE: "/images",
  });
  await testBasePathImages("/docs/_images");

  await run(["bunx", "astro", "build"], site, {
    ADAPTER_MODE: "standalone",
    FIXTURE_IMAGE_ROUTE: "/images/index.ts",
  });
  await testResolvedImageRoute();

  console.log(`Integration passed with Astro ${astroVersion}`);
} finally {
  if (process.env.KEEP_INTEGRATION_FIXTURE)
    console.log(`Fixture kept at ${temporary}`);
  else await rm(temporary, { recursive: true, force: true });
}
