import { afterEach, describe, expect, test } from "bun:test";

import { relaunchCommand, workerCount } from "../../src/worker.ts";

const execArgv = process.execArgv;
const argv = process.argv;

afterEach(() => {
  process.execArgv = execArgv;
  process.argv = argv;
  delete process.env.ASTRO_BUN_WORKERS;
});

describe("worker relaunch", () => {
  test("keeps runtime flags and arguments but not --cwd", () => {
    process.execArgv = ["--cwd", "app", "--smol", "--cwd=app", "--watch"];
    process.argv = [process.execPath, Bun.main, "--flag", "value"];
    expect(relaunchCommand()).toEqual([
      process.execPath,
      "--smol",
      "--watch",
      Bun.main,
      "--flag",
      "value",
    ]);
  });

  test("ASTRO_BUN_WORKERS overrides the configured count", () => {
    expect(workerCount(2)).toBe(2);
    process.env.ASTRO_BUN_WORKERS = "4";
    expect(workerCount(2)).toBe(4);
    process.env.ASTRO_BUN_WORKERS = "0";
    expect(() => workerCount(2)).toThrow("ASTRO_BUN_WORKERS");
  });
});
