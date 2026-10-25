# AGENTS.md

`@igloczek/astro-bun-adapter` runs Astro 7 server apps on Bun's native `Bun.serve()`. The goal is to be the best Bun adapter for **server-rendered Astro apps** (`output: "server"`).

## What matters

**Every server-side Astro feature works, with no extra setup.** This is the top priority:

- Astro Image (`/_image` endpoint)
- Sessions (filesystem storage by default)
- Actions
- Server islands
- `astro:env` runtime secrets
- Route caching through Astro's cache providers (`Astro.cache`, `memoryCache()`)
- Middleware and `Astro.clientAddress`
- CSP headers
- Custom 404 and 500 pages
- `astro preview`

When Astro ships a new server feature, supporting it is in scope.

**Running well as a server app:**

- Correct behaviour behind a reverse proxy: trusted `X-Forwarded-For` for client IPs, `X-Forwarded-Proto` for the HTTPS scheme.
- Standalone server, and a Fetch handler (middleware mode) for embedding in your own `Bun.serve()`.
- Safe serving of Astro's built assets: traversal and symlink containment, dotfile denial, clean `400` for malformed URLs.
- Request body limits, idle timeouts, and multiple processes on one port (`reusePort`).
- Server features from the comparison table that are still missing, such as WebSockets.

**Constraints:**

- Support every Astro 7 release from 7.2.8, and Bun 1.3.14 or newer. CI tests the oldest and newest. Raise the Astro floor when an older release has a known security vulnerability: nobody should run it.
- Zero runtime dependencies.
- Stay close to the upstream `@astrojs/node` integration contract, so Astro fixes carry over.

## What doesn't matter

These belong to the reverse proxy or CDN, or only help static sites. Don't add them, and don't suggest them as gaps to close:

- TLS termination. The `tls` option was removed in 0.3.0; don't reintroduce it.
- HTTP/2 and HTTP/3
- Brotli/gzip compression, including pre-compressed assets
- Unix sockets
- An adapter-level ISR or response cache. Astro's own cache providers are the supported path.
- Optimising static output or mostly-static sites

## Working rules

- README-only and other docs changes are committed directly to `main`, with no PR. Code changes go through a PR with a regression test.
- Requirements and commands are in [CONTRIBUTING.md](./CONTRIBUTING.md). Run `bun run check` before committing code.
- The README comparison table is a single table with no notes. Every cell about another adapter must come from actually installing and running it, not from its peer range or README. Keep the wording fair to other maintainers. When a gap closes here, update this adapter's column in the same change.
- Never publish a security vulnerability found in another adapter. Report it privately to its maintainers.
