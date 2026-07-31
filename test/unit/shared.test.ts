import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readHeadersJson } from "../../src/shared.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function outputDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "astro-bun-headers-"));
  directories.push(directory);
  return { directory, url: pathToFileURL(`${directory}${path.sep}`) };
}

describe("static headers manifest", () => {
  test("returns a valid generated manifest", async () => {
    const { directory, url } = await outputDirectory();
    await writeFile(
      path.join(directory, "_headers.json"),
      JSON.stringify([
        {
          pathname: "/docs",
          headers: [
            { key: "Content-Security-Policy", value: "default-src 'self'" },
          ],
        },
      ]),
    );
    expect(await readHeadersJson(url)).toHaveLength(1);
  });

  test("rejects malformed or unexpected data", async () => {
    const { directory, url } = await outputDirectory();
    await writeFile(path.join(directory, "_headers.json"), "{}");
    expect(await readHeadersJson(url)).toBeUndefined();
  });
});
