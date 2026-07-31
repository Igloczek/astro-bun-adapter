import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BunAppHeadersJson, Options } from "./types.js";
import { PACKAGE_NAME } from "./config.js";

export const STATIC_HEADERS_FILE = "_headers.json";

function appendForwardSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

export function resolveClientDir(options: Options): string {
  const relativePath = path.relative(
    fileURLToPath(new URL(options.server)),
    fileURLToPath(new URL(options.client)),
  );
  const serverFolder = path.basename(options.server);
  let serverEntryFolderUrl = path.dirname(import.meta.url);
  let previous = "";

  while (path.basename(serverEntryFolderUrl) !== serverFolder) {
    if (serverEntryFolderUrl === previous) {
      throw new Error(
        `[${PACKAGE_NAME}] Could not find the server directory "${serverFolder}" by walking up from "${import.meta.url}". Keep the built server entry inside a "${serverFolder}" directory when relocating or bundling the Astro output.`,
      );
    }
    previous = serverEntryFolderUrl;
    serverEntryFolderUrl = path.dirname(serverEntryFolderUrl);
  }

  return fileURLToPath(
    new URL(
      appendForwardSlash(relativePath),
      `${serverEntryFolderUrl}/entry.mjs`,
    ),
  );
}

export function resolveOutputDir(options: Options): string {
  return path.dirname(resolveClientDir(options));
}

function isHeadersJson(value: unknown): value is BunAppHeadersJson {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "pathname" in entry &&
        typeof entry.pathname === "string" &&
        "headers" in entry &&
        Array.isArray(entry.headers) &&
        entry.headers.every((header: unknown) => {
          if (typeof header !== "object" || header === null) return false;
          const record = header as Record<string, unknown>;
          return (
            typeof record.key === "string" && typeof record.value === "string"
          );
        }),
    )
  );
}

export async function readHeadersJson(
  outDir: string | URL,
): Promise<BunAppHeadersJson | undefined> {
  const file = Bun.file(
    outDir instanceof URL
      ? new URL(STATIC_HEADERS_FILE, outDir)
      : path.join(outDir, STATIC_HEADERS_FILE),
  );
  if (!(await file.exists())) return undefined;

  try {
    const value: unknown = JSON.parse(await file.text());
    if (!isHeadersJson(value)) throw new Error("unexpected data shape");
    return value;
  } catch (error) {
    console.error(
      `[${PACKAGE_NAME}] Could not parse ${STATIC_HEADERS_FILE}: ${(error as Error).message}`,
    );
    return undefined;
  }
}

export async function writeHeadersJson(output: URL, value: BunAppHeadersJson) {
  await writeFile(output, JSON.stringify(value, null, 2), "utf8");
}
