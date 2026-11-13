import { expect, test } from "bun:test";

// Dependabot's lockfile updates have dropped the `libc` field from Linux
// native packages, so Bun installs both the glibc and the musl build.
test("bun.lock keeps libc on musl-only native packages", async () => {
  const lockfile = await Bun.file(
    new URL("../../bun.lock", import.meta.url),
  ).text();
  const musl = lockfile
    .split("\n")
    .filter((line) => /^\s+"[^"]*(-musl|linuxmusl-[^"]*)": \["/.test(line));
  expect(musl.length).toBeGreaterThan(0);
  const missing = musl
    .filter((line) => !line.includes('"libc": "musl"'))
    .map((line) => line.trim().split('"')[1]);
  expect(missing).toEqual([]);
});
