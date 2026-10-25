# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## Unreleased

- Respect `session: false` (Astro 7.2+): the adapter no longer enables filesystem sessions when sessions are explicitly disabled, so Astro can tree-shake the session runtime.

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
