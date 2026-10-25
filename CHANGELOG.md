# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## Unreleased

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
