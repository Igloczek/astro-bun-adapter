import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { shutdownTimeout } from "../../src/worker.ts";

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

afterEach(() => {
  delete process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT;
});

describe("worker runtime", () => {
  test("ASTRO_BUN_SHUTDOWN_TIMEOUT overrides the configured timeout", () => {
    expect(shutdownTimeout(10)).toBe(10);
    process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT = "170";
    expect(shutdownTimeout(10)).toBe(170);
    process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT = "0";
    expect(shutdownTimeout(10)).toBe(0);
    process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT = "2147483";
    expect(shutdownTimeout(10)).toBe(2_147_483);
    for (const value of ["-1", "soon", "Infinity", "2147484"]) {
      process.env.ASTRO_BUN_SHUTDOWN_TIMEOUT = value;
      expect(() => shutdownTimeout(10)).toThrow("ASTRO_BUN_SHUTDOWN_TIMEOUT");
    }
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
