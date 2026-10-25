# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## Unreleased

- **Breaking:** require Bun 1.4.4 or newer (`engines.bun`). Earlier releases have known security vulnerabilities in the bundled brotli decoder (GHSA-663w-cv8g-jj2p) and root certificate store (GHSA-26q8-h657-pf84), both reachable through outbound `fetch`, for example remote images in `/_image`. CI now tests Bun 1.4.4 as the oldest supported release.
- **Breaking:** require Astro 7.3.3 or newer (`peerDependencies.astro: ^7.3.3`). Earlier Astro 7 releases have known security vulnerabilities, including a critical RCE in AVIF image optimization (fixed in 7.2.8), a base-path authorization bypass (fixed in 7.2.4), XSS through unescaped `<script>`/`<style>` content in JSX/MDX (GHSA-98hj-9722-w3j8, fixed in 7.3.2), and CSS injection in View Transitions (GHSA-mpr7-6m5w-76rw, fixed in 7.3.3). CI now tests 7.3.3 as the oldest supported release.
- **Breaking:** remove native TLS (the `tls` option and `SERVER_CERT_PATH`, `SERVER_KEY_PATH`, `SERVER_CA_PATH`, `SERVER_KEY_PASSPHRASE`). Terminate TLS at a reverse proxy and keep `X-Forwarded-Proto` for the public scheme. Passing `tls` fails the build, and the server refuses to start while those variables are set, so a deployment never falls back to plaintext silently.
- Add `workers` to run several processes on one port (Linux), in standalone and middleware mode, and `beforeStart` to run modules once before the server starts.
- **Breaking (security):** without `security.allowedDomains`, the `Host` header no longer controls `request.url`; every request uses `localhost:<port>`, matching `@astrojs/node` 11.1.7. List your public domains in `security.allowedDomains` to keep correct `Astro.url` values and `security.checkOrigin` behind a domain (for example Coolify); see "Migrating from 0.2" in the README.
- **Security:** when `security.allowedDomains` is configured, only a matching `Host` header controls `request.url` (`Astro.url`, redirects, origin checks); any other host is replaced with `localhost:<port>`. Previously the allowlist was ignored and any `Host` reached `Astro.url`. Without `allowedDomains`, behavior is unchanged.
- **Security:** Astro's `/_image` endpoint fetches local sources from the request origin, which Bun derives from the client's `Host` header, so a forged `Host` made the server send requests, including the client's headers, to an arbitrary host (SSRF). Unless the `Host` matches `security.allowedDomains`, image endpoint requests now load local sources from the server's own listening address, with forwarded origin headers dropped. The image route is taken from Astro's resolved routes. Middleware handlers accept a new `serverPort` context field for that address.
- Respect `session: false` (Astro 7.2+): the adapter no longer enables filesystem sessions when sessions are explicitly disabled, so Astro can tree-shake the session runtime.
- Return 404 instead of 500 for unknown parameters on a prerendered dynamic endpoint, matching `@astrojs/node` 11.1.2.

## 0.2.1 - 2026-08-14

- Apply `X-Forwarded-Proto` without a `trustedProxies` allowlist. Coolify and other TLS-terminating proxies do not need their Docker IP listed. `X-Forwarded-For` is still gated. `X-Forwarded-Host` is still ignored.

## 0.2.0 - 2026-08-14

- Apply trusted `X-Forwarded-Proto` to `request.url` so Astro's origin matches the public HTTPS scheme behind a TLS-terminating proxy. Untrusted peers cannot change the scheme. `X-Forwarded-Host` is ignored.

## 0.1.1 - 2026-07-31

- Align the package version with the automated npm and GitHub release tag.

## 0.1.0 - 2026-07-31

- Initial public release for Astro 7 and Bun 1.3.14 or newer.
- Standalone and middleware builds using Bun's native Fetch API server.
- Static files, conditional requests, byte ranges, CSP headers, preview, sessions, TLS, trusted proxies, and relocatable build output.
