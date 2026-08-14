import { isIP } from "node:net";
import path from "node:path";

import type { BaseApp } from "astro/app";

import { resolveClientDir } from "./shared.js";
import type { BunRequestContext, Options, RequestHandler } from "./types.js";

const FORWARDED_PROTOCOLS = new Set(["http", "https"]);

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

/**
 * Apply `X-Forwarded-Proto` only when the direct peer is trusted.
 * `X-Forwarded-Host` is ignored.
 */
export function applyForwardedOrigin(
  request: Request,
  peerAddress: string | undefined,
  trustedProxies: readonly string[],
) {
  if (!peerAddress || !trustedProxies.includes(peerAddress)) return request;

  const proto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  if (!proto || !FORWARDED_PROTOCOLS.has(proto)) return request;

  const url = new URL(request.url);
  if (url.protocol === `${proto}:`) return request;

  url.protocol = `${proto}:`;
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

export function createAppHandler(
  app: BaseApp,
  options: Options,
): RequestHandler {
  const client = resolveClientDir(options);

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
      const incoming = applyForwardedOrigin(
        request,
        context.clientAddress,
        options.trustedProxies,
      );
      const clientAddress = resolveClientAddress(
        incoming,
        context.clientAddress,
        options.trustedProxies,
      );
      const routeData = app.match(incoming, true);
      const renderOptions = {
        addCookieHeader: true,
        ...(clientAddress === undefined ? {} : { clientAddress }),
        ...(context.locals === undefined ? {} : { locals: context.locals }),
        prerenderedErrorPageFetch,
      };

      if (routeData && !(routeData.type === "page" && routeData.prerender)) {
        return await app.render(incoming, { ...renderOptions, routeData });
      }
      return await app.render(incoming, renderOptions);
    } catch (error) {
      app.adapterLogger.error(`Could not render ${request.url}`);
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
