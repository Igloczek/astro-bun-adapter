# `@igloczek/astro-bun-adapter`

An Astro 7 adapter for Bun's native `Bun.serve()` HTTP server. It supports standalone deployment and Fetch-handler middleware without a Node HTTP compatibility bridge.

Not sure which Bun adapter to use? See [Comparison with other Bun adapters](#comparison-with-other-bun-adapters).

## Requirements

- Astro 7
- Bun 1.3.14 or newer
- Node.js 22.12 or newer for Astro's build tooling

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
| `tls`                          | none              | Certificate/key paths for native TLS                    |
| `experimentalDisableStreaming` | `false`           | Disable Astro HTML streaming                            |

### Trusted proxies

`X-Forwarded-For` is ignored unless the direct peer is listed in `trustedProxies`. The adapter walks the forwarding chain from right to left and returns the last untrusted address, preventing a client from forging the leftmost value through a well-behaved proxy.

`X-Forwarded-Proto` is applied when the first hop is `http` or `https`. That restores the public scheme behind a TLS-terminating proxy (Coolify, Caddy, Traefik) so Astro's `/_image` endpoint self-fetches `https://your-domain/...` instead of `http://...`. `X-Forwarded-Host` is never applied.

```ts
bun({
  mode: "standalone",
  trustedProxies: ["127.0.0.1", "10.0.0.10"],
});
```

Use the actual address returned by `Bun.serve().requestIP()`; IPv4-mapped IPv6 addresses and plain IPv4 addresses are distinct strings.

### TLS

```ts
bun({
  mode: "standalone",
  tls: {
    certPath: "/run/secrets/tls.crt",
    keyPath: "/run/secrets/tls.key",
    caPath: "/run/secrets/ca.crt",
  },
});
```

Runtime environment alternatives are `SERVER_CERT_PATH`, `SERVER_KEY_PATH`, `SERVER_CA_PATH`, `SERVER_NAME`, and `SERVER_KEY_PASSPHRASE`. Certificate and key must always be configured together. A reverse proxy terminating TLS is usually simpler.

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

|                                                   | **This adapter** | [`@nauverse/astro-bun`](https://github.com/TheNaubit/astro-bun) | [`@wyattjoh/astro-bun-adapter`](https://github.com/wyattjoh/astro-bun-adapter) | [`@scale.digital/astro-bun`](https://github.com/ScaliirDigital/root/tree/main/packages/astro-bun) | [`@nurodev/astro-bun`](https://github.com/nurodev/astro-bun) | [`@hedystia/astro-bun`](https://github.com/Zastinian/astro-bun) |
| ------------------------------------------------- | :--------------: | :-------------------------------------------------------------: | :----------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------: | :----------------------------------------------------------: | :-------------------------------------------------------------: |
| Declared Astro version                            |     `^7.0.0`     |                            `^7.4.0`                             |                                    `^6.3.1`                                    |                                             `^6.3.0`                                              |                           `^5.1.1`                           |                            `^5.0.0`                             |
| Runs on Astro 7.4.2                               |        ✅        |                               ✅                                |                                       ✅                                       |                                                ✅                                                 |                              ❌                              |                               ❌                                |
| Minimum Bun                                       |      1.3.14      |                              1.4.3                              |                                      1.0                                       |                                                1.3                                                |                              —                               |                                —                                |
| Latest release                                    | 0.2.1 · Aug 2026 |                        0.1.4 · Oct 2026                         |                                2.1.1 · Jul 2026                                |                                         0.1.2 · Oct 2026                                          |                       2.1.2 · Nov 2025                       |                        0.3.2 · Jun 2025                         |
| Standalone server on `Bun.serve()`                |        ✅        |                               ✅                                |                                       ✅                                       |                                                ✅                                                 |                              ✅                              |                               ✅                                |
| Fetch handler for your own `Bun.serve()`          |        ✅        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                      ⚠️ legacy `handle`                      |                       ⚠️ legacy `handle`                        |
| `astro preview` support                           |        ✅        |                               ✅                                |                                       ❌                                       |                                    ⚠️ needs `index.mjs` entry                                     |                              ❌                              |                               ❌                                |
| ETag / `304 Not Modified` for static files        |        ✅        |                               ✅                                |                                       ✅                                       |                                                ✅                                                 |                              ❌                              |                               ❌                                |
| Immutable caching for `/_astro/` assets           |        ✅        |                               ✅                                |                                       ✅                                       |                                                ✅                                                 |                              ✅                              |                               ✅                                |
| Proxy allowlist for client IP (`X-Forwarded-For`) |        ✅        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                              ❌                              |                               ❌                                |
| Native TLS                                        |        ✅        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                              ✅                              |                               ✅                                |
| Request body size limit and idle timeout          |        ✅        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                              ❌                              |                               ✅                                |
| `reusePort` (Linux only)                          |        ✅        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                              ❌                              |                               ✅                                |
| Built-in multi-process workers                    |        ❌        |                            ✅ Linux                             |                                       ❌                                       |                                                ❌                                                 |                      ⚠️ no `reusePort`                       |                            ✅ Linux                             |
| Unix socket                                       |        ❌        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                              ✅                              |                               ✅                                |
| WebSockets                                        |        ❌        |                               ✅                                |                                       ❌                                       |                                                ❌                                                 |                              ❌                              |                               ❌                                |
| Persistent SSR cache (ISR)                        |        ❌        |                               ✅                                |                                       ✅                                       |                                                ✅                                                 |                              ❌                              |                               ❌                                |
| On-demand cache invalidation                      |        ❌        |                               ✅                                |                                ⚠️ unstable API                                 |                                          ⚠️ unstable API                                          |                              ❌                              |                               ❌                                |
| Pre-compressed Brotli/gzip static assets          |        ❌        |                               ✅                                |                                       ❌                                       |                                                ✅                                                 |                              ❌                              |                               ❌                                |
| Zero runtime dependencies                         |        ✅        |                               ✅                                |                                       ❌                                       |                                                ✅                                                 |                              ❌                              |                               ✅                                |
| License                                           |       MIT        |                               MIT                               |                                      MIT                                       |                                           BSD-3-Clause                                            |                             MIT                              |                               MIT                               |

## Compatibility and releases

Every change is checked against the oldest supported Astro 7 release and the current Astro 7 release, using the packed npm tarball in standalone and middleware fixtures. Releases are published from GitHub Actions with npm trusted publishing and provenance.

This adapter was derived from the MIT-licensed `@astrojs/node` adapter and keeps its Astro integration contract intentionally close to upstream. It replaces Node's HTTP bridge with native Bun Request/Response handling.

See [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md).
