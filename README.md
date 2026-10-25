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

Astro has no official Bun adapter, so there are several community ones, each with different strengths. Start with your Astro version, then pick by the features you need.

**How this was checked (October 2026):** each package's latest npm release was installed in a minimal Astro 7.4.2 project with SSR, prerendered and `astro:assets` image routes, built with `bunx astro build`, and run on Bun 1.4.4 with default options. Feature cells come from each package's documentation and shipped code. Other configurations were not tested. Corrections are welcome.

### At a glance

| Adapter                                                                                           | Declared Astro (npm) | Runs on Astro 7.4.2? | Latest release        | Best for                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------- | -------------------- | --------------------- | ------------------------------------------------------------------------- |
| **`@igloczek/astro-bun-adapter`** (this one)                                                      | `^7.0.0`             | ✅                   | 0.2.1 · Aug 2026      | A small adapter close to `@astrojs/node`, for any Astro 7 and Bun 1.3.14+ |
| [`@nauverse/astro-bun`](https://github.com/TheNaubit/astro-bun)                                   | `^7.4.0`             | ✅                   | 0.1.4 · Oct 2026      | Astro 7.4+ with built-in ISR, compression, WebSockets or workers          |
| [`@wyattjoh/astro-bun-adapter`](https://github.com/wyattjoh/astro-bun-adapter)                    | `^6.3.1` (v1.x: 5)   | ✅ not yet declared¹ | 2.1.1 · Jul 2026      | Astro 6 (and 5 with v1.x) sites that need ISR                             |
| [`@scale.digital/astro-bun`](https://github.com/ScaliirDigital/root/tree/main/packages/astro-bun) | `^6.3.0`             | ✅ not declared¹     | 0.1.2 · Oct 2026      | Astro 6 with SSR caching and pre-compressed assets (pre-1.0 API)          |
| [`@nurodev/astro-bun`](https://github.com/nurodev/astro-bun)                                      | `^5.1.1`             | ❌²                  | 2.1.2 · Nov 2025      | Astro 5 projects needing cluster mode or Unix sockets                     |
| [`@hedystia/astro-bun`](https://github.com/Zastinian/astro-bun)                                   | `^5.0.0`             | ❌²                  | 0.3.2 · Jun 2025      | Astro 5 projects needing cluster mode or low-level server options         |
| [`astro-bun-websocket`](https://github.com/lilnasy/gratelets)                                     | none (Astro 5 era)   | ❌²                  | 1.0.5 · Sep 2025      | Astro 5 projects needing WebSockets (a fork of `@nurodev/astro-bun`)      |
| [`astro-bun-adapter`](https://github.com/ido-pluto/astro-bun-adapter)                             | `^4.0.7`             | ❌²                  | 1.0.2 · Dec 2023      | Astro 4 projects                                                          |
| [`astro-bun`](https://github.com/andremralves/astro-bun)                                          | `^3.0.13`            | ❌²                  | 0.0.5-beta · Sep 2023 | Astro 3 projects                                                          |

1. SSR, prerendered pages, static files, images and the adapter's SSR cache all worked in the test above. Because the published peer range excludes Astro 7, npm refuses the install with `ERESOLVE` unless you pass `--legacy-peer-deps`; Bun and pnpm only warn. `@wyattjoh/astro-bun-adapter` already declares Astro `^7.1.3` on its `main` branch, so declared support is expected in its next release.
2. Failed to start in the tested configuration. These adapters were written for an earlier Astro major and call an adapter API (`getAdapterLogger`) that Astro 7 no longer provides.

### Features

Covers the adapters that run on Astro 5 or newer. ✅ supported · ❌ not provided by the adapter · ⚠️ partial or with caveats.

| Feature                                            | **This adapter** | `@nauverse` | `@wyattjoh` | `@scale.digital` | `@nurodev` | `@hedystia` |
| -------------------------------------------------- | :--------------: | :---------: | :---------: | :--------------: | :--------: | :---------: |
| Standalone server on `Bun.serve()`                 |        ✅        |     ✅      |     ✅      |        ✅        |     ✅     |     ✅      |
| Fetch handler for your own `Bun.serve()`           |        ✅        |     ✅      |     ❌      |        ❌        |    ⚠️ᵃ     |     ⚠️ᵃ     |
| `astro preview` support                            |        ✅        |     ✅      |     ❌      |        ✅        |     ❌     |     ❌      |
| ETag / `304 Not Modified` for static files         |        ✅        |     ✅      |     ✅      |        ✅        |     ❌     |     ❌      |
| Immutable caching for `/_astro/` assets            |        ✅        |     ✅      |     ✅      |        ✅        |     ✅     |     ✅      |
| Proxy allowlist for client IP (`X-Forwarded-For`)  |        ✅        |     ✅      |     ❌      |        ❌        |     ❌     |     ❌      |
| Native TLS                                         |        ✅        |     ✅      |     ❌      |        ❌        |     ✅     |     ✅      |
| Request body size limit and idle timeout options   |        ✅        |     ✅      |     ❌      |        ❌        |     ❌     |     ✅      |
| `reusePort` (Linux only)                           |        ✅        |     ✅      |     ❌      |        ❌        |     ❌     |     ✅      |
| Built-in multi-process workers                     |        ❌        |  ✅ Linux   |     ❌      |        ❌        |    ⚠️ᵇ     |     ⚠️ᵇ     |
| Unix socket                                        |        ❌        |     ✅      |     ❌      |        ❌        |     ✅     |     ✅      |
| WebSockets                                         |       ⚠️ᶜ        |     ✅      |     ❌      |        ❌        |     ❌     |     ❌      |
| Adapter-provided SSR cache (ISR) persisted to disk |       ❌ᵈ        |     ✅      |     ✅      |        ✅        |     ❌     |     ❌      |
| On-demand cache invalidation                       |       ⚠️ᵈ        |     ✅      |     ⚠️ᵉ     |       ⚠️ᵉ        |     ❌     |     ❌      |
| Pre-compressed Brotli/gzip static assets           |        ❌        |     ✅      |     ❌      |        ✅        |     ❌     |     ❌      |
| Zero runtime dependencies                          |        ✅        |     ✅      |     ❌      |        ✅        |     ❌     |     ✅      |
| License                                            |       MIT        |     MIT     |     MIT     |   BSD-3-Clause   |    MIT     |     MIT     |

- ᵃ Exposes Astro's legacy `handle` export rather than a documented Fetch handler.
- ᵇ Cluster options fork processes, but Bun only load-balances one port across processes on Linux.
- ᶜ Not built in. Use middleware mode inside your own `Bun.serve()`, which can handle WebSocket upgrades itself.
- ᵈ No adapter cache of its own, but Astro 7's built-in `memoryCache()` provider works with this adapter. It gives in-process caching, stale-while-revalidate and `cache.invalidate()`, without persistence across restarts.
- ᵉ Exported as `unstable_expirePath` / `unstable_expireAll`. `@wyattjoh` documents them as experimental and outside semver; `@scale.digital`'s README uses different names than the published package exports.

Byte-range requests work in all of them, because Bun handles `Range` natively for file responses.

### Which one should I pick?

- **Astro 7.4+, and you want ISR, compression, WebSockets or workers built in:** `@nauverse/astro-bun`.
- **Astro 7.0–7.3, Bun 1.3.x, or a small adapter that stays close to the official `@astrojs/node`:** this adapter. It is tested against both the oldest and newest Astro 7 releases.
- **Astro 7 inside your own `Bun.serve()`** (custom routes, WebSockets, a shared server): this adapter's middleware mode, or `@nauverse/astro-bun`'s handler mode.
- **Astro 6:** `@wyattjoh/astro-bun-adapter`, or `@scale.digital/astro-bun` if you also want pre-compressed assets and can accept a pre-1.0 API. Both run on Astro 7 too, so upgrading later is possible.
- **Astro 5:** `@wyattjoh/astro-bun-adapter` v1.x for ETag static serving, `@nurodev/astro-bun` or `@hedystia/astro-bun` for cluster mode or Unix sockets, or `astro-bun-websocket` for WebSockets.
- **Multiple processes with this adapter:** on Linux, run several processes with `reusePort: true`; elsewhere, use separate ports behind a load balancer.

## Compatibility and releases

Every change is checked against the oldest supported Astro 7 release and the current Astro 7 release, using the packed npm tarball in standalone and middleware fixtures. Releases are published from GitHub Actions with npm trusted publishing and provenance.

This adapter was derived from the MIT-licensed `@astrojs/node` adapter and keeps its Astro integration contract intentionally close to upstream. It replaces Node's HTTP bridge with native Bun Request/Response handling.

See [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md).
