import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ENTRY_DECLARATION,
  entryDeclarationName,
  writeEntryDeclaration,
} from "../../src/entry-declaration.ts";

describe("server entry declaration", () => {
  test("follows the entry's module format", () => {
    expect(entryDeclarationName("entry.mjs")).toBe("entry.d.mts");
    expect(entryDeclarationName("main.js")).toBe("main.d.ts");
    expect(entryDeclarationName("server.cjs")).toBe("server.d.cts");
    expect(entryDeclarationName("entry")).toBeUndefined();
    expect(entryDeclarationName(".mjs")).toBeUndefined();
  });

  test("is written next to a built entry only", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "astro-bun-entry-"));
    const serverDir = pathToFileURL(`${directory}/`);
    try {
      await writeEntryDeclaration(serverDir, "entry.mjs");
      expect(await readdir(directory)).toEqual([]);

      await writeFile(path.join(directory, "entry.mjs"), "");
      await writeEntryDeclaration(serverDir, "entry.mjs");
      expect(await readFile(path.join(directory, "entry.d.mts"), "utf8")).toBe(
        ENTRY_DECLARATION,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
