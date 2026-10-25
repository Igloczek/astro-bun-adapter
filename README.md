<h1 align="center">@igloczek/astro-bun-adapter</h1>

<p align="center">
  <strong>Astro 7 on Bun's native HTTP server.</strong>
  <br>
  Standalone or as middleware, with no Node HTTP compatibility bridge.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@igloczek/astro-bun-adapter"><img src="https://img.shields.io/npm/v/@igloczek/astro-bun-adapter?color=cb3837&logo=npm" alt="npm version"></a>
  <a href="https://astro.build"><img src="https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white" alt="Astro 7"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3.14%2B-14151A?logo=bun&logoColor=white" alt="Bun 1.3.14 or newer"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#standalone-server">Standalone</a> ·
  <a href="#middleware">Middleware</a> ·
  <a href="#options">Options</a> ·
  <a href="#static-serving">Static serving</a> ·
  <a href="#comparison-with-other-bun-adapters">Compare adapters</a>
</p>

---

- **Native Bun, end to end.** Requests go straight from `Bun.serve()` to Astro as web-standard `Request`/`Response` objects.
- **Standalone or embedded.** Run the generated server, or mount Astro's Fetch handler inside your own `Bun.serve()`.
- **The full Astro server feature set.** Astro Image, sessions (filesystem storage by default), actions, server islands, `astro:env` secrets, route caching, CSP and custom error pages.
- **Hardened asset serving.** Traversal and symlink containment, dotfile denial, ETags, byte ranges and immutable asset caching.
- **Proxy-aware.** Trusted `X-Forwarded-For` handling for real client IPs, and HTTPS restored behind TLS-terminating proxies.
- **Tested on every change.** CI covers the oldest and newest Astro 7 releases, and releases are published with npm provenance.

## Requirements

- Astro 7
- Bun 1.3.14 or newer
- Node.js for Astro's build tooling, at the version your Astro release requires (22.12 for Astro 7.0, 22.23.4 since Astro 7.4.2)

## Install

```sh
bun add @igloczek/astro-bun-adapter
```

## Standalone server

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import bun from "@igloczek/astro-bun-adapter";

export default defineConfig({
  output: "server",
  adapter: bun({ mode: "standalone" }),
});
```

Build and run the generated server:

```sh
bunx astro build
bun ./dist/server/entry.mjs
```

Run Astro preview with Bun as the script interpreter:

```sh
bunx --bun astro preview
```

`HOST` and `PORT` override Astro's configured host and port at runtime.

## Middleware

Middleware mode exports a web-standard `(Request, context) => Promise<Response>` handler. Your server is responsible for static files.

```ts
// astro.config.ts
adapter: bun({ mode: "middleware" });
```

```ts
// server.ts
import { handler } from "./dist/server/entry.mjs";

Bun.serve({
  port: 3000,
  fetch(request, server) {
    const clientAddress = server.requestIP(request)?.address;
    return handler(request, {
      ...(clientAddress ? { clientAddress } : {}),
      serverPort: server.port,
      locals: { requestId: crypto.randomUUID() },
    });
  },
});
```

The entry module also exports normalized `options` and an idempotent `startServer()` function. Set `ASTRO_BUN_AUTOSTART=disabled` before importing a standalone entry when you need to call `startServer()` yourself.

## Options

| Option                         | Default           | Purpose                                                 |
| ------------------------------ | ----------------- | ------------------------------------------------------- |
| `mode`                         | required          | `standalone` or `middleware`                            |
| `staticHeaders`                | `false`           | Serve Astro-generated CSP headers for prerendered files |
| `bodySizeLimit`                | Bun default       | Maximum body bytes; `0`/`Infinity` disables the limit   |
| `reusePort`                    | `false`           | Allow multiple Bun processes on one port                |
| `idleTimeout`                  | Bun default (10s) | `0` disables it; maximum is 255 seconds                 |
| `trustedProxies`               | `[]`              | Exact proxy IPs allowed to supply `X-Forwarded-For`     |
| `experimentalDisableStreaming` | `false`           | Disable Astro HTML streaming                            |

### Allowed domains

The `Host` header only controls `Astro.url` when it matches Astro's [`security.allowedDomains`](https://docs.astro.build/en/reference/configuration-reference/#securityalloweddomains). Any other host is replaced with `localhost:<port>`, so a forged `Host` cannot poison absolute URLs, redirects, or origin checks. This matches `@astrojs/node`.

List your public domains in production. Otherwise `Astro.url` reports `localhost` and `security.checkOrigin` rejects form posts from your real origin:

```ts
export default defineConfig({
  security: {
    allowedDomains: [{ hostname: "example.com", protocol: "https" }],
  },
});
```

In middleware mode, pass `serverPort` so the fallback origin uses the port your server listens on.

#### Migrating from 0.2

Deployments behind a domain, such as Coolify, Caddy, or Traefik with TLS terminated at the proxy, must add that domain to `security.allowedDomains`. Without it, `Astro.url` reports `https://localhost:<port>` and form posts from the public origin fail `security.checkOrigin` with 403.

Native TLS was removed: the `tls` option and the `SERVER_CERT_PATH`, `SERVER_KEY_PATH`, `SERVER_CA_PATH` and `SERVER_KEY_PASSPHRASE` variables. Terminate TLS at your reverse proxy or load balancer instead. The build fails while `tls` is configured, and the server refuses to start while those variables are set.

### Image optimization

The adapter uses Astro's built-in image endpoint (`/_image`), which optimizes images on demand. It loads remote sources allowed by `image.domains` / `image.remotePatterns`, and local sources (files in `dist/client` or routes rendered on demand) by requesting them from the server's own origin.

Bun derives that origin from the client's `Host` header, so the adapter only keeps it when it matches Astro's [`security.allowedDomains`](https://docs.astro.build/en/reference/configuration-reference/#securityalloweddomains). Otherwise, local sources are requested from the server's listening address, such as `http://127.0.0.1:<port>`, and forwarded origin headers are dropped, so a forged `Host` or `X-Forwarded-Host` cannot make the server fetch from another host. An allowlist entry without a `port` trusts every port on that hostname, so include `port` when that matters. In middleware mode, pass `serverPort` so that address uses your server's port.

### Trusted proxies

`X-Forwarded-For` is ignored unless the direct peer is listed in `trustedProxies`. The adapter walks the forwarding chain from right to left and returns the last untrusted address, preventing a client from forging the leftmost value through a well-behaved proxy.

`X-Forwarded-Proto` is applied when the first hop is `http` or `https`. That restores the public scheme (`Astro.url`, origin checks) behind a TLS-terminating proxy (Coolify, Caddy, Traefik). The adapter never applies `X-Forwarded-Host` itself; Astro applies it, and `X-Forwarded-Proto`/`X-Forwarded-Port`, only when they match `security.allowedDomains`.

```ts
bun({
  mode: "standalone",
  trustedProxies: ["127.0.0.1", "10.0.0.10"],
});
```

Use the actual address returned by `Bun.serve().requestIP()`; IPv4-mapped IPv6 addresses and plain IPv4 addresses are distinct strings.

## Static serving

Standalone mode provides:

- traversal and symlink containment inside `dist/client`
- dotfile denial with `/.well-known` support
- `GET`/`HEAD`, ETag, Last-Modified, conditional requests, and single byte ranges
- immutable caching for Astro's generated asset directory
- clean URLs, base paths, and Astro trailing-slash redirects
- Astro-generated CSP headers for prerendered routes

Unsupported multi-range requests are safely served as complete `200` responses.

## Comparison with other Bun adapters

|                               | **This**  | [Nauverse](https://github.com/TheNaubit/astro-bun) | [Wyatt](https://github.com/wyattjoh/astro-bun-adapter) | [Scaliir](https://github.com/ScaliirDigital/root/tree/main/packages/astro-bun) |
| ----------------------------- | :-------: | :------------------------------------------------: | :----------------------------------------------------: | :----------------------------------------------------------------------------: |
| Best for                      | SSR apps  |                 Static + some SSR                  |                       SSR + ISR                        |                                 SSR + caching                                  |
| Declared Astro                |  `^7.0`   |                       `^7.4`                       |                         `^6.3`                         |                                     `^6.3`                                     |
| Minimum Bun                   |  1.3.14   |                       1.4.3                        |                          1.0                           |                                      1.3                                       |
| Latest version                |   0.2.1   |                       0.1.4                        |                         2.1.1                          |                                     0.1.2                                      |
| **Astro features**            |           |                                                    |                                                        |                                                                                |
| Astro Image (`/_image`)       |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Sessions                      |    ✅     |                  ⚠️ needs driver                   |                           ✅                           |                                       ✅                                       |
| Actions                       |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Server islands                |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| `astro:env` runtime secrets   |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Route caching (`Astro.cache`) |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Middleware                    |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| `Astro.clientAddress`         |    ✅     |                         ✅                         |                     ⚠️ not in ISR                      |                                       ✅                                       |
| CSP headers                   | ✅ opt-in |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Custom 404 page               |    ✅     |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Custom 500 page               |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| `astro preview`               |    ✅     |                         ✅                         |                           ❌                           |                                   ⚠️ config                                    |
| **Server**                    |           |                                                    |                                                        |                                                                                |
| Standalone server             |    ✅     |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Handler for own `Bun.serve()` |    ✅     |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Trusted proxies (client IP)   |    ✅     |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Body limit / idle timeout     |    ✅     |                         ✅                         |                           ❌                           |                                       ❌                                       |
| `reusePort` (Linux)           |    ✅     |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Multi-process workers         | ⚠️ manual |                         ✅                         |                           ❌                           |                                       ❌                                       |
| WebSockets                    |    ❌     |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Zero dependencies             |    ✅     |                         ✅                         |                           ❌                           |                                       ✅                                       |
| Known security issues         |     0     |                         0                          |                           1                            |                                       2                                        |
| License                       |    MIT    |                        MIT                         |                          MIT                           |                                     BSD-3                                      |

## Compatibility and releases

Every change is checked against the oldest supported Astro 7 release and the current Astro 7 release, using the packed npm tarball in standalone and middleware fixtures. Releases are published from GitHub Actions with npm trusted publishing and provenance.

This adapter was derived from the MIT-licensed `@astrojs/node` adapter and keeps its Astro integration contract intentionally close to upstream. It replaces Node's HTTP bridge with native Bun Request/Response handling.

See [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md).
