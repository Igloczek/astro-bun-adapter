import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supervisorModule = fileURLToPath(
  new URL("../../src/supervisor.ts", import.meta.url),
);
const workers = process.platform === "linux" ? 2 : 1;
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "astro-bun-supervisor-"));
  await Bun.write(
    path.join(directory, "worker.ts"),
    `const index = process.env.ASTRO_BUN_WORKER;
const crashOnce = process.env.CRASH_ONCE;
if (process.env.CRASH_ALWAYS) process.exit(1);
if (crashOnce && !(await Bun.file(crashOnce).exists())) {
  await Bun.write(crashOnce, "");
  console.log("crashing " + index);
  process.exit(1);
}
process.on("SIGTERM", () => {
  console.log("stopped " + index);
  process.exit(0);
});
setInterval(() => {}, 1000);
console.log("started " + index);
`,
  );
  await Bun.write(
    path.join(directory, "supervisor.ts"),
    `import { supervise } from ${JSON.stringify(supervisorModule)};
await supervise({
  command: [process.execPath, ${JSON.stringify(path.join(directory, "worker.ts"))}],
  workers: Number(process.env.WORKERS),
});
`,
  );
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function startSupervisor(env: Record<string, string>) {
  const child = Bun.spawn(
    [process.execPath, path.join(directory, "supervisor.ts")],
    {
      env: { ...process.env, WORKERS: String(workers), ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const lines: string[] = [];
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  return {
    child,
    lines,
    async waitFor(count: number, prefix: string) {
      const matching = () => lines.filter((line) => line.startsWith(prefix));
      while (matching().length < count) {
        const chunk = await reader.read();
        if (chunk.done) {
          throw new Error(`Supervisor exited; output: ${lines.join(" | ")}`);
        }
        buffered += decoder.decode(chunk.value, { stream: true });
        const parts = buffered.split("\n");
        buffered = parts.pop() ?? "";
        lines.push(...parts);
      }
      return matching();
    },
  };
}

describe("supervise", () => {
  test("starts indexed workers and forwards SIGTERM to them", async () => {
    const supervisor = startSupervisor({});
    const started = await supervisor.waitFor(workers, "started ");
    expect(started.sort()).toEqual(
      Array.from({ length: workers }, (_, index) => `started ${index}`),
    );

    supervisor.child.kill("SIGTERM");
    expect(await supervisor.child.exited).toBe(0);
    await supervisor.waitFor(workers, "stopped ");
  });

  test("restarts a worker that exits", async () => {
    const supervisor = startSupervisor({
      WORKERS: "1",
      CRASH_ONCE: path.join(directory, "crashed"),
    });
    await supervisor.waitFor(1, "crashing 0");
    await supervisor.waitFor(1, "started 0");

    supervisor.child.kill("SIGTERM");
    expect(await supervisor.child.exited).toBe(0);
    expect(await new Response(supervisor.child.stderr).text()).toContain(
      "Worker 0 exited with code 1; restarting.",
    );
  });

  test("stops with exit code 1 when workers keep exiting", async () => {
    const supervisor = startSupervisor({ WORKERS: "1", CRASH_ALWAYS: "1" });
    expect(await supervisor.child.exited).toBe(1);
    expect(await new Response(supervisor.child.stderr).text()).toContain(
      "workers keep exiting, stopping.",
    );
  });

  test.skipIf(process.platform === "linux")(
    "runs one worker where Bun cannot balance reusePort",
    async () => {
      const supervisor = startSupervisor({ WORKERS: "3" });
      await supervisor.waitFor(1, "started ");
      supervisor.child.kill("SIGTERM");
      expect(await supervisor.child.exited).toBe(0);
      expect(
        supervisor.lines.filter((line) => line.startsWith("started ")),
      ).toHaveLength(1);
      expect(await new Response(supervisor.child.stderr).text()).toContain(
        "starting 1 worker instead of 3",
      );
    },
  );

  test("rejects invalid options", async () => {
    const { supervise } = await import("../../src/supervisor.ts");
    await expect(supervise({ command: [], workers: 1 })).rejects.toThrow(
      "command",
    );
    await expect(supervise({ command: ["bun"], workers: 0 })).rejects.toThrow(
      "workers",
    );
  });
});
