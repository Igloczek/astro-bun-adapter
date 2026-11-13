import { expect, test } from "bun:test";

// Dependabot's lockfile updates have dropped the `libc` field from Linux
// native packages, so Bun installs both the glibc and the musl build.
const lockfile = await Bun.file(
  new URL("../../bun.lock", import.meta.url),
).text();

function missingLibc(name: RegExp, libc: string) {
  const entries = lockfile
    .split("\n")
    .filter((line) => name.test(line.trim().split('"')[1] ?? ""));
  expect(entries.length).toBeGreaterThan(0);
  return entries
    .filter((line) => !line.includes(`"libc": "${libc}"`))
    .map((line) => line.trim().split('"')[1]);
}

// Arm hard-float builds (`-gnueabihf`, `-musleabihf`) declare no libc.
test("bun.lock keeps libc on musl-only native packages", () => {
  expect(missingLibc(/(-musl|linuxmusl-.*)$/, "musl")).toEqual([]);
});

test("bun.lock keeps libc on glibc-only native packages", () => {
  expect(missingLibc(/-gnu$/, "glibc")).toEqual([]);
});
