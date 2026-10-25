import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isWatching, relaunchCommand, workerCount } from "../../src/worker.ts";

const workerModule = fileURLToPath(
  new URL("../../src/worker.ts", import.meta.url),
);

async function withDirectory<T>(run: (directory: string) => Promise<T>) {
  const directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "astro-bun-worker-")),
  );
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

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

  test("relaunches a compiled executable without its embedded entry", () => {
    expect(
      relaunchCommand("/$bunfs/root/app", [], ["bun", "/$bunfs/root/app", "a"]),
    ).toEqual([process.execPath, "a"]);
  });

  test(
    "relaunches a real compiled executable with only its arguments",
    () =>
      withDirectory(async (directory) => {
        const entry = path.join(directory, "entry.ts");
        const executable = path.join(directory, "app");
        await Bun.write(
          entry,
          `import { relaunchCommand } from ${JSON.stringify(workerModule)};
console.log(JSON.stringify(relaunchCommand()));
`,
        );
        const build = Bun.spawn(
          ["bun", "build", "--compile", entry, "--outfile", executable],
          { stdout: "ignore", stderr: "inherit" },
        );
        expect(await build.exited).toBe(0);
        const run = Bun.spawn([executable, "hello"], { stdout: "pipe" });
        expect(JSON.parse(await new Response(run.stdout).text())).toEqual([
          executable,
          "hello",
        ]);
      }),
    30_000,
  );

  test("detects in-place reloads", () => {
    expect(isWatching(["--watch"])).toBe(true);
    expect(isWatching(["--hot"])).toBe(true);
    expect(isWatching(["--smol"])).toBe(false);
  });

  test("force-exits a worker whose supervisor is already gone", () =>
    withDirectory(async (directory) => {
      const script = path.join(directory, "worker.ts");
      await Bun.write(
        script,
        `import { stopWithSupervisor } from ${JSON.stringify(workerModule)};
process.on("SIGTERM", () => console.log("ignored SIGTERM"));
setInterval(() => {}, 1000);
stopWithSupervisor(0.2);
`,
      );
      // A PID that isn't the parent stands in for a supervisor that died
      // before the worker started watching it.
      const worker = Bun.spawn([process.execPath, script], {
        env: { ...process.env, ASTRO_BUN_SUPERVISOR_PID: "999999" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const timeout = setTimeout(() => worker.kill("SIGKILL"), 5000);
      expect(await worker.exited).toBe(1);
      clearTimeout(timeout);
      expect(await new Response(worker.stdout).text()).toContain(
        "ignored SIGTERM",
      );
    }));
});
