<h1 align="center">@igloczek/astro-bun-adapter</h1>

<p align="center">
  <strong>Astro 7 on Bun's native HTTP server.</strong>
  <br>
  Standalone or as middleware, with no Node HTTP compatibility bridge.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@igloczek/astro-bun-adapter"><img src="https://img.shields.io/npm/v/@igloczek/astro-bun-adapter?color=cb3837&logo=npm" alt="npm version"></a>
  <a href="https://astro.build"><img src="https://img.shields.io/badge/Astro-7.3.3%2B-BC52EE?logo=astro&logoColor=white" alt="Astro 7.3.3 or newer"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.4.4%2B-14151A?logo=bun&logoColor=white" alt="Bun 1.4.4 or newer"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#standalone-server">Standalone</a> ·
  <a href="#middleware">Middleware</a> ·
  <a href="#options">Options</a> ·
  <a href="#comparison-with-other-bun-adapters">Compare adapters</a>
</p>

---

- **Native Bun, end to end.** Requests go straight from `Bun.serve()` to Astro as web-standard `Request`/`Response` objects.
- **Standalone or embedded.** Run the generated server, or mount Astro's Fetch handler inside your own `Bun.serve()`.
- **The full Astro server feature set.** Astro Image, sessions (filesystem storage by default), actions, server islands, `astro:env` secrets, route caching, CSP and custom error pages.
- **Hardened asset serving.** Traversal and symlink containment, dotfile denial, ETags, byte ranges and immutable asset caching.
- **Proxy-aware.** Trusted `X-Forwarded-For` handling for real client IPs, and HTTPS restored behind TLS-terminating proxies.
- **Tested on every change.** CI covers the oldest supported and newest Astro 7 releases, and releases are published with npm provenance.

## Requirements

- Astro 7.3.3 or newer
- Bun 1.4.4 or newer
- Node.js for Astro's build tooling, at the version your Astro release requires

Older Astro and Bun releases have known security vulnerabilities.

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

Build and run:

```sh
bunx astro build
bun ./dist/server/entry.mjs
```

`HOST` and `PORT` override the configured host and port. Preview with `bunx --bun astro preview`.

## Middleware

Middleware mode exports a Fetch handler for your own `Bun.serve()`. Your server is responsible for the static files in `dist/client`, including the `/_astro/` images that Astro Image optimizes.

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
    return handler(request, { clientAddress, serverPort: server.port });
  },
});
```

## Behind a reverse proxy

Add your public domain to Astro's [`security.allowedDomains`](https://docs.astro.build/en/reference/configuration-reference/#securityalloweddomains). Without it, `Astro.url` reports `localhost` and form posts fail Astro's origin check.

```ts
export default defineConfig({
  security: {
    allowedDomains: [{ hostname: "example.com", protocol: "https" }],
  },
});
```

To get the visitor's IP in `Astro.clientAddress` instead of the proxy's, list the proxy's IP in `trustedProxies`:

```ts
adapter: bun({ mode: "standalone", trustedProxies: ["10.0.1.5"] });
```

Use the address the proxy connects from. For a Docker proxy, find it with `docker inspect <proxy-container>`.

## Options

| Option                         | Default     | Purpose                                                    |
| ------------------------------ | ----------- | ---------------------------------------------------------- |
| `mode`                         | required    | `standalone` or `middleware`                               |
| `workers`                      | `1`         | Server processes on one port (Linux); crashed ones restart |
| `beforeStart`                  | none        | Modules to run once before the server starts               |
| `reusePort`                    | `false`     | Allow multiple Bun processes on one port                   |
| `bodySizeLimit`                | Bun default | Maximum request body bytes                                 |
| `idleTimeout`                  | `10`        | Seconds before an idle connection closes                   |
| `trustedProxies`               | `[]`        | Proxy IPs trusted for `X-Forwarded-For` client addresses   |
| `staticHeaders`                | `false`     | Serve Astro-generated CSP headers for prerendered files    |
| `experimentalDisableStreaming` | `false`     | Disable Astro HTML streaming                               |

The `ASTRO_BUN_WORKERS` environment variable overrides `workers` at runtime.

## Comparison with other Bun adapters

|                                     | **This** | [Nauverse](https://github.com/TheNaubit/astro-bun) | [Wyatt](https://github.com/wyattjoh/astro-bun-adapter) | [Scaliir](https://github.com/ScaliirDigital/root/tree/main/packages/astro-bun) |
| ----------------------------------- | :------: | :------------------------------------------------: | :----------------------------------------------------: | :----------------------------------------------------------------------------: |
| Best for                            | SSR apps |                 Static + some SSR                  |                       SSR + ISR                        |                                 SSR + caching                                  |
| Declared Astro                      | `^7.3.3` |                       `^7.4`                       |                         `^6.3`                         |                                     `^6.3`                                     |
| Minimum Bun                         |  1.4.4   |                       1.4.3                        |                          1.0                           |                                      1.3                                       |
| Latest version                      |  1.0.0   |                       0.1.4                        |                         2.1.1                          |                                     0.1.2                                      |
| **Astro features**                  |          |                                                    |                                                        |                                                                                |
| Astro Image (`/_image`)             |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Sessions                            |    ✅    |                  ⚠️ needs driver                   |                           ✅                           |                                       ✅                                       |
| Actions                             |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Server islands                      |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| `astro:env` runtime secrets         |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Route caching (`Astro.cache`)       |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Middleware                          |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| `Astro.clientAddress`               |    ✅    |                         ✅                         |                     ⚠️ not in ISR                      |                                       ✅                                       |
| CSP headers                         |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Custom 404 page                     |    ✅    |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Custom 500 page                     |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| `astro preview`                     |    ✅    |                         ✅                         |                           ❌                           |                                   ⚠️ config                                    |
| **Server**                          |          |                                                    |                                                        |                                                                                |
| Standalone server                   |    ✅    |                         ✅                         |                           ✅                           |                                       ✅                                       |
| Handler for own `Bun.serve()`       |    ✅    |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Trusted proxies (client IP)         |    ✅    |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Body limit / idle timeout           |    ✅    |                         ✅                         |                           ❌                           |                                       ❌                                       |
| `reusePort` (Linux)                 |    ✅    |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Multi-process workers               |    ✅    |                         ✅                         |                           ❌                           |                                       ❌                                       |
| Workers with your own `Bun.serve()` |    ✅    |                         ❌                         |                           ❌                           |                                       ❌                                       |
| Setup before start (`beforeStart`)  |    ✅    |                         ❌                         |                           ❌                           |                                       ❌                                       |
| Zero dependencies                   |    ✅    |                         ✅                         |                           ❌                           |                                       ✅                                       |
| Known security issues               |    0     |                         0                          |                           1                            |                                       2                                        |
| License                             |   MIT    |                        MIT                         |                          MIT                           |                                     BSD-3                                      |

## Compatibility and releases

CI tests the oldest and newest supported Astro 7 releases. Releases are published with npm provenance. The adapter is derived from `@astrojs/node` and keeps its integration contract close to upstream.

See [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md).
