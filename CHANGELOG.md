# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## 1.2.0 - 2026-10-26

Multiple processes now run from a supervisor script you write, instead of a hidden mode inside the server. Your setup code, your workers and your server's shutdown are all plain code you can read.

### Breaking

- **`workers`, `beforeStart` and `ASTRO_BUN_WORKERS` are removed.** Importing `dist/server/entry.mjs` no longer turns a process into a supervisor. Instead, write a `supervisor.ts`, put one-time setup (what `beforeStart` ran) before `supervise()`, and start the container with `bun ./supervisor.ts`:

  ```ts
  import { supervise } from "@igloczek/astro-bun-adapter/supervisor";

  await runMigrations(); // was beforeStart
  await supervise({
    command: [process.execPath, "./server.ts"], // or "./dist/server/entry.mjs"
    workers: Number(process.env.WORKERS ?? 2), // was workers / ASTRO_BUN_WORKERS
  });
  ```

  The build fails with a pointer to `supervise()` while `workers` or `beforeStart` is set.

### New

- **`supervise()` from `@igloczek/astro-bun-adapter/supervisor`.** It starts that many copies of your command on one port (Linux; one elsewhere), restarts any that exit, forwards `SIGTERM` and `SIGINT`, and kills workers still running after `shutdownTimeout` seconds (default 60). It imports nothing from Astro or your app, so the supervisor process stays small and runs only your script.

### Clarified

- **A custom server owns its shutdown.** In middleware mode, your `Bun.serve()` finishes in-flight requests only if your `server.ts` handles the shutdown signal; the README shows handlers for `SIGTERM` and `SIGINT`. 1.1.0's shutdown handling, and the `shutdownTimeout` option, apply to the standalone server.

## 1.1.0 - 2026-10-26

### New

- **Shutdown waits up to 60 seconds for running work, and you can change that with `shutdownTimeout`.** On `SIGTERM` or `SIGINT` (a deploy, `docker stop`, Ctrl+C), the server stops taking new connections, finishes the requests in flight, and lets your app's own `SIGTERM` handlers finish, such as closing a job queue. With `workers`, 1.0 killed everything after 10 seconds; the default is now 60. For longer work, raise it, for example `shutdownTimeout: 170`, or set `ASTRO_BUN_SHUTDOWN_TIMEOUT` at deploy time. Your platform's own stop grace period still applies, so raise it too: `docker stop` waits only 10 seconds by default (`stop_grace_period` in Compose, `kill_timeout` on Fly).

### Fixes

- **With `workers`, your app's code no longer runs in the supervisor.** The supervisor process serves no requests, but it loaded your app: module-level code in a custom `src/fetch.ts` (Astro's advanced routing) or in a renderer ran there once more, starting an extra scheduler or job consumer. Your app now loads only in the workers. `beforeStart` modules still run in the supervisor, once, by design.
- **`docker stop` no longer waits 10 seconds for a single standalone server.** As the container's main process, it ignored `SIGTERM`, so Docker killed it mid-request. It now shuts down as described above.
- **A custom server's import of `./dist/server/entry.mjs` is typed.** The build writes `entry.d.mts` next to the entry, so `handler` and `options` get the adapter's types instead of `any` or `{}`.

## 1.0.0 - 2026-10-25

The first stable release. It adds multi-process workers and a startup hook, closes two security holes around the `Host` header, and drops native TLS. From here on, breaking changes to the options, environment variables and middleware handler documented in the README only come in a new major version.

### Before you upgrade

1. **Update Astro and Bun.** 1.0 needs Astro 7.3.3 or newer and Bun 1.4.4 or newer. Older versions have public security vulnerabilities, including remote code execution through AVIF images in Astro before 7.2.8, XSS in Astro before 7.3.2, and flaws in Bun's `fetch` that remote images in `/_image` go through.
2. **Behind a domain, list it in `security.allowedDomains`.** This applies if you run behind Coolify, Caddy, Traefik, nginx or a load balancer. The adapter no longer trusts the `Host` header on its own (see the security fixes below). Without this setting, `Astro.url` shows `localhost` instead of your domain, and form and Action posts from your site fail with 403.

   ```ts
   export default defineConfig({
     security: {
       allowedDomains: [{ hostname: "example.com", protocol: "https" }],
     },
   });
   ```

3. **If you used the `tls` option, terminate TLS at your proxy instead.** Native TLS is gone, together with the `SERVER_CERT_PATH`, `SERVER_KEY_PATH`, `SERVER_CA_PATH` and `SERVER_KEY_PASSPHRASE` variables. A build with `tls` fails, and the server refuses to start while those variables are set, so a site never quietly falls back to plain HTTP.
4. **In middleware mode, check which port your server listens on.** If your `Bun.serve()` listens on the `PORT` environment variable (as on Fly, Coolify or with portless) or on Astro's `server.port`, there's nothing to do. Otherwise, pass the port to the handler, or Astro Image can't load your local images:

   ```ts
   return handler(request, { clientAddress, serverPort: server.port });
   ```

### New

- **Use every CPU core with `workers`.** `workers: 4` runs four server processes on one port, and a process that crashes is restarted. You can also set the count at deploy time with the `ASTRO_BUN_WORKERS` environment variable. This works on Linux, in standalone and middleware mode. On macOS and Windows the server logs a warning and runs one process.
- **Run setup code once with `beforeStart`.** Point it at your own modules, for example database migrations or a cache warm-up: `beforeStart: ["./src/migrate.ts"]`. They run in order before the server starts, and only once even with several workers. If a module's default export is a function, the server waits for it to finish.

### Security fixes

- **Forged `Host` headers could make your server request other hosts.** Astro Image loads local images by requesting them from the address in the visitor's `Host` header. A visitor could send a fake `Host` and make your server send requests, with the visitor's headers, to any host they chose. Local images now always load from the server itself, unless the `Host` is listed in `security.allowedDomains`.
- **`Astro.url` could be set to any domain.** A forged `Host` header became `Astro.url`, and that flowed into redirects and Astro's origin check for forms. Even with `security.allowedDomains` set, the list was ignored. Now only a domain on that list reaches `Astro.url`; any other request sees `localhost`. This matches `@astrojs/node`, and it's why step 2 above is needed.

### Fixes

- `session: false` now really turns sessions off. The adapter used to switch filesystem sessions back on.
- A prerendered API route with `getStaticPaths()` returns 404 for an unknown path, instead of 500.
- With an IPv6 `HOST`, the startup log prints a valid address, such as `http://[::1]:4321`.
- The TypeScript types of `@igloczek/astro-bun-adapter/server.js` resolve. They used to show up as `any`, or as type errors with `skipLibCheck: false`.

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
