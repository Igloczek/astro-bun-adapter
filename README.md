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

Astro has no official Bun adapter, so there are several community ones, each with different strengths. Pick the one that fits your Astro version and the features you need.

This comparison was checked in October 2026 against each package's latest npm release. Each adapter was built and run in a minimal Astro 7.4.2 project with SSR, prerendered and `astro:assets` image routes. Corrections are welcome.

### At a glance

| Adapter                                                                                           | Declared Astro | Runs on Astro 7? | Latest release        | Best for                                                         |
| ------------------------------------------------------------------------------------------------- | -------------- | ---------------- | --------------------- | ---------------------------------------------------------------- |
| **`@igloczek/astro-bun-adapter`** (this one)                                                      | 7              | ✅               | 0.2.1 · Aug 2026      | Astro 7, standalone or embedded in your own `Bun.serve()`        |
| [`@wyattjoh/astro-bun-adapter`](https://github.com/wyattjoh/astro-bun-adapter)                    | 6 (v1.x: 5)    | ✅ undeclared¹   | 2.1.1 · Jul 2026      | Sites that need ISR / SSR response caching                       |
| [`@scale.digital/astro-bun`](https://github.com/ScaliirDigital/root/tree/main/packages/astro-bun) | 6              | ✅ undeclared¹   | 0.1.2 · Oct 2026      | SSR caching plus pre-compressed Brotli/gzip assets (pre-1.0 API) |
| [`@nurodev/astro-bun`](https://github.com/nurodev/astro-bun)                                      | 5              | ❌²              | 2.1.2 · Nov 2025      | Astro 5 projects needing cluster mode or Unix sockets            |
| [`@hedystia/astro-bun`](https://github.com/Zastinian/astro-bun)                                   | 5              | ❌²              | 0.3.2 · Jun 2025      | Astro 5 projects needing cluster mode or low-level server knobs  |
| [`astro-bun-adapter`](https://github.com/ido-pluto/astro-bun-adapter)                             | 4              | ❌²              | 1.0.2 · Dec 2023      | Astro 4 projects                                                 |
| [`astro-bun`](https://github.com/andremralves/astro-bun)                                          | 3              | not tested       | 0.0.5-beta · Sep 2023 | Astro 3 projects                                                 |

1. Builds and serves SSR, prerendered pages, static files, images and the ISR cache correctly on Astro 7.4.2. Its `astro` peer dependency is `^6`, so npm refuses the install with `ERESOLVE` unless you pass `--legacy-peer-deps` (Bun and pnpm only warn). Configurations beyond these routes have not been tested.
2. The build succeeds, but the server crashes at startup (`getAdapterLogger is not a function`), because Astro 7 removed an API these adapters use.

### Features

Covers the adapters for Astro 5 and newer. ✅ supported · ❌ not supported · ⚠️ partial or with caveats.

| Feature                                               | **This adapter** | `@wyattjoh` | `@scale.digital` | `@nurodev` | `@hedystia` |
| ----------------------------------------------------- | :--------------: | :---------: | :--------------: | :--------: | :---------: |
| Standalone server on `Bun.serve()`                    |        ✅        |     ✅      |        ✅        |     ✅     |     ✅      |
| Middleware mode (handler for your own server)         |        ✅        |     ❌      |        ❌        |    ⚠️ᵃ     |     ⚠️ᵃ     |
| ETag / `304 Not Modified` for static files            |        ✅        |     ✅      |        ✅        |     ❌     |     ❌      |
| Immutable caching for `/_astro/` assets               |        ✅        |     ✅      |        ✅        |     ✅     |     ✅      |
| Astro CSP / route headers on prerendered pages        |        ✅        |     ✅      |        ✅        |     ❌     |     ❌      |
| Dotfiles in `public/` blocked (except `/.well-known`) |        ✅        |     ❌      |        ❌        |     ❌     |     ❌      |
| Trusted proxies (`X-Forwarded-For` / `-Proto`)        |        ✅        |     ❌      |        ❌        |     ❌     |     ❌      |
| Native TLS                                            |        ✅        |     ❌      |        ❌        |     ✅     |     ✅      |
| Request body size limit and idle timeout options      |        ✅        |     ❌      |        ❌        |     ❌     |     ✅      |
| `reusePort`                                           |        ✅        |     ❌      |        ❌        |     ❌     |     ✅      |
| Built-in cluster mode (one worker per CPU)            |        ❌        |     ❌      |        ❌        |     ✅     |     ✅      |
| Unix socket                                           |        ❌        |     ❌      |        ❌        |     ✅     |     ✅      |
| ISR / stale-while-revalidate SSR cache                |        ❌        |     ✅ᵇ     |        ✅        |     ❌     |     ❌      |
| On-demand cache invalidation                          |        ❌        |     ⚠️ᶜ     |        ✅        |     ❌     |     ❌      |
| Pre-compressed Brotli/gzip static assets              |        ❌        |     ❌      |        ✅        |     ❌     |     ❌      |
| Generic error page in production (no stack trace)     |        ✅        |     ✅      |        ✅        |    ❌ᵈ     |     ❌ᵈ     |
| Zero runtime dependencies                             |        ✅        |     ❌      |        ✅        |     ❌     |     ✅      |
| License                                               |       MIT        |     MIT     |   BSD-3-Clause   |    MIT     |     MIT     |

- ᵃ Exposes Astro's legacy `handle` export, not a documented Fetch handler for your own server.
- ᵇ `Astro.clientAddress` is unavailable during ISR cache-miss renders (documented limitation).
- ᶜ `unstable_expirePath` / `unstable_expireAll`, documented as experimental and outside semver.
- ᵈ Unhandled errors are returned to the client as an HTML page with the error message and stack trace.

Byte-range requests work in all of them, because Bun handles `Range` natively for file responses.

### Which one should I pick?

- **Astro 7 with declared, tested support:** this adapter. It is the only one whose peer dependency includes Astro 7 and whose CI tests against it.
- **Astro 7 with ISR / SSR caching:** `@wyattjoh/astro-bun-adapter` runs on Astro 7 in practice. Expect the peer-dependency warning (or `--legacy-peer-deps` with npm). `@scale.digital/astro-bun` is an alternative if you also want pre-compressed assets and can accept a pre-1.0 API.
- **Astro 6:** `@wyattjoh/astro-bun-adapter` or `@scale.digital/astro-bun`. This adapter requires Astro 7.
- **Astro 5:** `@wyattjoh/astro-bun-adapter` v1.x for ETag static serving, or `@nurodev/astro-bun` / `@hedystia/astro-bun` for cluster mode or Unix sockets.
- **Astro inside your own `Bun.serve()`** (custom routes, WebSockets, a shared server): this adapter's middleware mode.
- **Behind a reverse proxy and need the real client IP or HTTPS scheme:** this adapter's `trustedProxies`.
- **Cluster mode, Unix sockets, or pre-compressed assets on Astro 7 without leaving this adapter:** not built in yet. Use a CDN or reverse proxy for caching and compression, run several processes with `reusePort: true`, or [open an issue](https://github.com/Igloczek/astro-bun-adapter/issues).

## Compatibility and releases

Every change is checked against the oldest supported Astro 7 release and the current Astro 7 release, using the packed npm tarball in standalone and middleware fixtures. Releases are published from GitHub Actions with npm trusted publishing and provenance.

This adapter was derived from the MIT-licensed `@astrojs/node` adapter and keeps its Astro integration contract intentionally close to upstream. It replaces Node's HTTP bridge with native Bun Request/Response handling.

See [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md).
