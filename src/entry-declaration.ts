import { access, writeFile } from "node:fs/promises";

import { PACKAGE_NAME } from "./config.js";

/**
 * Declaration that types the built server entry. A custom server imports
 * `dist/server/entry.mjs` directly, and TypeScript would otherwise infer its
 * exports from the bundled JavaScript.
 */
export const ENTRY_DECLARATION = `export { beforeStart, handler, options, startServer } from "${PACKAGE_NAME}/server.js";\n`;

/** `entry.mjs` → `entry.d.mts`; undefined for a non-JavaScript file name. */
export function entryDeclarationName(serverEntry: string) {
  const match = /^(.+)\.([cm]?)js$/.exec(serverEntry);
  return match ? `${match[1]}.d.${match[2]}ts` : undefined;
}

/** Writes the declaration next to the server entry, if Astro built one. */
export async function writeEntryDeclaration(
  serverDir: URL,
  serverEntry: string,
) {
  const name = entryDeclarationName(serverEntry);
  if (!name) return;
  try {
    await access(new URL(serverEntry, serverDir));
  } catch {
    return;
  }
  await writeFile(new URL(name, serverDir), ENTRY_DECLARATION);
}
