import { isIP } from "node:net";
import path from "node:path";

import { BaseApp } from "astro/app";

import { resolveClientDir } from "./shared.js";
import type { BunRequestContext, Options, RequestHandler } from "./types.js";

const FORWARDED_PROTOCOLS = new Set(["http", "https"]);
const PRERENDERED_ROUTE_TYPES = new Set(["page", "endpoint"]);

function firstForwardedValue(value: string | null) {
  const token = value?.split(",")[0]?.trim().toLowerCase();
  return token || undefined;
}

function forwardedAddresses(value: string | null) {
  if (!value) return undefined;
  const addresses = value.split(",").map((address) => address.trim());
  return addresses.length > 0 && addresses.every((address) => isIP(address) > 0)
    ? addresses
    : undefined;
}

/** Resolves the last untrusted hop without trusting client-supplied headers. */
export function resolveClientAddress(
  request: Request,
  peerAddress: string | undefined,
  trustedProxies: readonly string[],
) {
  if (!peerAddress || !trustedProxies.includes(peerAddress)) return peerAddress;

  const forwarded = forwardedAddresses(request.headers.get("x-forwarded-for"));
  if (!forwarded) return peerAddress;

  const trusted = new Set(trustedProxies);
  const chain = [...forwarded, peerAddress];
  while (chain.length > 0 && trusted.has(chain.at(-1)!)) chain.pop();
  return chain.at(-1) ?? peerAddress;
}

/** Apply `X-Forwarded-Proto` only. `X-Forwarded-Host` is ignored. */
export function applyForwardedOrigin(request: Request) {
  const proto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  if (!proto || !FORWARDED_PROTOCOLS.has(proto)) return request;

  const url = new URL(request.url);
  if (url.protocol === `${proto}:`) return request;

  url.protocol = `${proto}:`;
  return new Request(url, request);
}

/** Address this server can reach itself on, from its listening host. */
function selfHost(host: string | boolean) {
  if (host === false || host === "localhost") return "localhost";
  if (host === true || host === "" || host === "0.0.0.0") return "127.0.0.1";
  if (host === "::") return "[::1]";
  return isIP(host) === 6 ? `[${host}]` : host;
}

const FORWARDED_ORIGIN_HEADERS = [
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
];

/**
 * Astro's generic image endpoint loads local sources by fetching them from
 * `request.url`'s origin, and Bun builds that origin from the client's `Host`
 * header. Unless the Host is trusted (it matches `security.allowedDomains`),
 * point image endpoint requests at this server itself so a forged Host cannot
 * make the server fetch from another host (SSRF). Forwarded origin headers are
 * dropped so Astro cannot re-apply them to the rewritten URL.
 */
export function applyImageEndpointOrigin(
  incoming: Request,
  serverUrl: URL,
  host: string | boolean,
  serverPort: number,
  hostTrusted: boolean,
) {
  if (hostTrusted) return incoming;

  const url = new URL(incoming.url);
  url.protocol = serverUrl.protocol;
  url.host = `${selfHost(host)}:${serverPort}`;
  const rewritten = new Request(url, incoming);
  for (const name of FORWARDED_ORIGIN_HEADERS) rewritten.headers.delete(name);
  return rewritten;
}

/**
 * Only a `Host` that matches `security.allowedDomains` may control
 * `request.url`. Anything else, including every Host when no allowlist is
 * configured, is replaced with `localhost:<serverPort>`, so a forged Host
 * cannot reach `Astro.url`, origin checks, or redirects.
 */
export function applyTrustedHost(
  request: Request,
  hostTrusted: boolean,
  serverPort: number,
) {
  if (hostTrusted) return request;

  const url = new URL(request.url);
  const fallbackHost = serverPort ? `localhost:${serverPort}` : "localhost";
  if (url.host === fallbackHost) return request;
  url.host = fallbackHost;
  return new Request(url, request);
}

async function readErrorPageFromDisk(
  client: string,
  status: 404 | 500,
): Promise<Response | undefined> {
  for (const filePath of [`${status}.html`, `${status}/index.html`]) {
    const file = Bun.file(path.join(client, filePath));
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }
}

/**
 * The port to assume when a middleware caller omits `serverPort`: `PORT`, which
 * hosts and dev proxies (Fly, Coolify, portless) set for the server to listen
 * on, then Astro's build-time `server.port`.
 */
export function defaultServerPort(port: number) {
  const value = Number(process.env.PORT);
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : port;
}

export function createAppHandler(
  app: BaseApp,
  options: Options,
): RequestHandler {
  const client = resolveClientDir(options);
  const fallbackServerPort = defaultServerPort(options.port);

  const prerenderedErrorPageFetch = async (url: URL | RequestInfo) => {
    const { pathname } = new URL(url.toString());
    if (
      pathname.endsWith("/404.html") ||
      pathname.endsWith("/404/index.html")
    ) {
      return (
        (await readErrorPageFromDisk(client, 404)) ??
        new Response(null, { status: 404 })
      );
    }
    if (
      pathname.endsWith("/500.html") ||
      pathname.endsWith("/500/index.html")
    ) {
      return (
        (await readErrorPageFromDisk(client, 500)) ??
        new Response(null, { status: 404 })
      );
    }
    return new Response(null, { status: 404 });
  };

  return async (request, context: BunRequestContext = {}) => {
    try {
      decodeURI(new URL(request.url).pathname);
    } catch {
      return new Response("Bad request.", { status: 400 });
    }

    try {
      const allowedDomains = app.getAllowedDomains();
      const forwarded = applyForwardedOrigin(request);
      const forwardedUrl = new URL(forwarded.url);
      // Decide once, on the client's Host, and reuse it for every rewrite.
      const hostTrusted =
        Boolean(allowedDomains?.length) &&
        BaseApp.validateForwardedHost(
          forwardedUrl.host,
          allowedDomains,
          forwardedUrl.protocol.slice(0, -1),
        );
      let incoming = applyTrustedHost(
        forwarded,
        hostTrusted,
        context.serverPort ?? fallbackServerPort,
      );
      const clientAddress = resolveClientAddress(
        incoming,
        context.clientAddress,
        options.trustedProxies,
      );
      // Include prerendered routes so static-mode redirects stay dynamic, but
      // re-match without them so a prerendered page or endpoint cannot shadow a
      // lower-priority on-demand route (or 500 on unknown params).
      let routeData = app.match(incoming, true);
      if (routeData?.prerender && PRERENDERED_ROUTE_TYPES.has(routeData.type)) {
        routeData = app.match(incoming);
      }
      if (
        routeData?.type === "endpoint" &&
        routeData.route === options.imageEndpointRoute
      ) {
        incoming = applyImageEndpointOrigin(
          incoming,
          new URL(request.url),
          options.host,
          context.serverPort ?? fallbackServerPort,
          hostTrusted,
        );
      }
      const renderOptions = {
        addCookieHeader: true,
        ...(clientAddress === undefined ? {} : { clientAddress }),
        ...(context.locals === undefined ? {} : { locals: context.locals }),
        prerenderedErrorPageFetch,
      };

      return await app.render(
        incoming,
        routeData ? { ...renderOptions, routeData } : renderOptions,
      );
    } catch (error) {
      app.adapterLogger.error(`Could not render ${request.url}`);
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
