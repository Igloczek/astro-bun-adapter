import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { BaseApp } from "astro/app";

import { resolveClientDir } from "./shared.js";
import type { BunAppHeadersJson, Options } from "./types.js";

function prependForwardSlash(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

function hasFileExtension(value: string) {
  return /\/[^/]+\.\w+$/.test(value);
}

function isInternalPath(value: string) {
  const prefix = value.slice(0, 2).replaceAll("\\", "/");
  return (
    new Set(["/_", "/@", "/.", "//"]).has(prefix) && !/^\/{2,}$/.test(value)
  );
}

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function safePath(root: string, requestPath: string) {
  const relativePath = requestPath.replace(/^[/\\]+/, "");
  const lexicalPath = path.resolve(root, relativePath);
  if (!isInside(root, lexicalPath)) return undefined;

  try {
    const resolvedPath = await realpath(lexicalPath);
    if (!isInside(root, resolvedPath)) return undefined;
    return { path: resolvedPath, stat: await stat(resolvedPath) };
  } catch {
    return undefined;
  }
}

function redirect(location: string) {
  return new Response(null, { status: 301, headers: { Location: location } });
}

function matchesIfNoneMatch(value: string, etag: string) {
  const weakTag = etag.replace(/^W\//, "");
  return (
    value === "*" ||
    value
      .split(",")
      .some((candidate) => candidate.trim().replace(/^W\//, "") === weakTag)
  );
}

function isNotModified(request: Request, etag: string, modified: Date) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch !== null) return matchesIfNoneMatch(ifNoneMatch, etag);

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const modifiedSince = new Date(ifModifiedSince);
  return (
    !Number.isNaN(modifiedSince.valueOf()) &&
    Math.trunc(modified.valueOf() / 1000) <=
      Math.trunc(modifiedSince.valueOf() / 1000)
  );
}

type ParsedRange =
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" }
  | { kind: "ignore" }
  | undefined;

function parseRange(value: string | null, size: number): ParsedRange {
  if (!value) return undefined;
  if (!value.startsWith("bytes=") || value.includes(","))
    return { kind: "ignore" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match) return { kind: "ignore" };
  const startValue = match[1] ?? "";
  const endValue = match[2] ?? "";
  if (!startValue && !endValue) return { kind: "ignore" };

  let start: number;
  let end: number;
  if (!startValue) {
    const suffixLength = Number(endValue);
    if (
      !Number.isSafeInteger(suffixLength) ||
      suffixLength <= 0 ||
      size === 0
    ) {
      return { kind: "unsatisfiable" };
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return { kind: "unsatisfiable" };
  }
  return { kind: "range", start, end: Math.min(end, size - 1) };
}

function matchesIfRange(value: string | null, etag: string, modified: Date) {
  if (!value) return true;
  if (value.startsWith('"') || value.startsWith("W/")) {
    return !value.startsWith("W/") && value === etag;
  }
  const date = new Date(value);
  return (
    !Number.isNaN(date.valueOf()) &&
    Math.trunc(modified.valueOf() / 1000) <= Math.trunc(date.valueOf() / 1000)
  );
}

async function fileResponse(
  root: string,
  requestPath: string,
  headers: Headers,
  request: Request,
) {
  const candidate = await safePath(root, requestPath);
  if (!candidate?.stat.isFile()) return undefined;

  const file = Bun.file(candidate.path);
  const modified = candidate.stat.mtime;
  const size = candidate.stat.size;
  const etag = `W/"${size.toString(16)}-${Math.trunc(modified.valueOf()).toString(16)}"`;
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", etag);
  headers.set("Last-Modified", modified.toUTCString());
  headers.set("Content-Length", size.toString());
  if (file.type && !headers.has("Content-Type"))
    headers.set("Content-Type", file.type);

  if (isNotModified(request, etag, modified)) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  const parsedRange = matchesIfRange(
    request.headers.get("if-range"),
    etag,
    modified,
  )
    ? parseRange(request.headers.get("range"), size)
    : { kind: "ignore" as const };

  if (parsedRange?.kind === "unsatisfiable") {
    headers.delete("Content-Length");
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (parsedRange?.kind === "range") {
    const length = parsedRange.end - parsedRange.start + 1;
    headers.set("Content-Length", length.toString());
    headers.set(
      "Content-Range",
      `bytes ${parsedRange.start}-${parsedRange.end}/${size}`,
    );
    return new Response(
      request.method === "HEAD"
        ? null
        : file.slice(parsedRange.start, parsedRange.end + 1),
      { status: 206, headers },
    );
  }

  // Bun automatically applies a single Range header to BunFile responses.
  // Use its stream when RFC semantics require us to ignore that header.
  const body =
    parsedRange?.kind === "ignore" && request.headers.has("range")
      ? file.stream()
      : file;
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

function normalizedRoutePath(value: string) {
  let normalized = path.posix.normalize(prependForwardSlash(value));
  if (normalized.endsWith("/index.html"))
    normalized = normalized.slice(0, -11) || "/";
  else if (normalized.endsWith(".html"))
    normalized = normalized.slice(0, -5) || "/";
  if (normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return normalized;
}

function isDotfilePath(value: string) {
  return value
    .split("/")
    .some((segment) => segment.startsWith(".") && segment !== ".well-known");
}

export function createStaticHandler(
  app: BaseApp,
  options: Options,
  headersMap: BunAppHeadersJson | undefined,
) {
  const client = resolveClientDir(options);
  const clientRoot = realpath(client);

  return async (request: Request): Promise<Response | undefined> => {
    if (request.method !== "GET" && request.method !== "HEAD") return undefined;

    const url = new URL(request.url);
    const urlPath = url.pathname;
    let fsPath = app.removeBase(urlPath);
    try {
      fsPath = decodeURI(fsPath);
    } catch {
      return undefined;
    }
    if (fsPath.includes("\\") || fsPath.includes("\0")) return undefined;

    const root = await clientRoot;
    const initialPath = await safePath(root, fsPath);
    const isDirectory = initialPath?.stat.isDirectory() ?? false;
    const hasSlash = urlPath.endsWith("/");
    let pathname = urlPath;
    const headers = new Headers();

    if (headersMap?.length) {
      const routeData = app.match(request, true);
      if (routeData?.prerender) {
        const requestRoute = normalizedRoutePath(app.removeBase(urlPath));
        const matchedRoute = headersMap.find(
          (entry) => normalizedRoutePath(entry.pathname) === requestRoute,
        );
        for (const header of matchedRoute?.headers ?? []) {
          headers.set(header.key, header.value);
        }
      }
    }

    switch (app.manifest.trailingSlash) {
      case "never":
        if (isDirectory && urlPath !== "/" && hasSlash) {
          return redirect(`${urlPath.slice(0, -1)}${url.search}`);
        }
        if (isDirectory && !hasSlash) pathname = `${urlPath}/index.html`;
        break;
      case "ignore":
        if (isDirectory && !hasSlash) pathname = `${urlPath}/index.html`;
        break;
      case "always":
        if (
          !hasSlash &&
          !hasFileExtension(urlPath) &&
          !isInternalPath(urlPath)
        ) {
          return redirect(`${urlPath}/${url.search}`);
        }
        break;
    }

    const normalizedPathname = path.posix.normalize(
      prependForwardSlash(app.removeBase(pathname)),
    );
    if (isDotfilePath(normalizedPathname)) return undefined;
    if (normalizedPathname.startsWith(`/${app.manifest.assetsDir}/`)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }

    let response = await fileResponse(
      root,
      normalizedPathname,
      headers,
      request,
    );
    if (
      !response &&
      (app.manifest.buildFormat === "file" ||
        app.manifest.buildFormat === "preserve")
    ) {
      response = await fileResponse(
        root,
        `${normalizedPathname}.html`,
        headers,
        request,
      );
    }
    return response;
  };
}
