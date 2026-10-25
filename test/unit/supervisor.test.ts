import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supervisorModule = fileURLToPath(
  new URL("../../src/supervisor.ts", import.meta.url),
);
const workers = process.platform === "linux" ? 2 : 1;
const running: Bun.Subprocess[] = [];
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
  if (!process.env.IGNORE_SIGTERM) process.exit(0);
});
// Exit with a supervisor that the test failed to stop.
const supervisor = process.ppid;
setInterval(() => process.ppid !== supervisor && process.exit(1), 200);
console.log("started " + index);
`,
  );
  await Bun.write(
    path.join(directory, "supervisor.ts"),
    `import { supervise } from ${JSON.stringify(supervisorModule)};
await supervise({
  command: [process.execPath, ${JSON.stringify(path.join(directory, "worker.ts"))}],
  workers: Number(process.env.WORKERS),
  ...(process.env.SHUTDOWN_TIMEOUT
    ? { shutdownTimeout: Number(process.env.SHUTDOWN_TIMEOUT) }
    : {}),
});
`,
  );
});

afterEach(async () => {
  for (const child of running.splice(0)) {
    child.kill("SIGKILL");
    await child.exited;
  }
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
  running.push(child);
  const lines: string[] = [];
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  const read = async () => {
    const chunk = await reader.read();
    if (chunk.done) return false;
    buffered += decoder.decode(chunk.value, { stream: true });
    const parts = buffered.split("\n");
    buffered = parts.pop() ?? "";
    lines.push(...parts);
    return true;
  };

  return {
    child,
    lines,
    async waitFor(count: number, prefix: string) {
      const matching = () => lines.filter((line) => line.startsWith(prefix));
      while (matching().length < count) {
        if (!(await read())) {
          throw new Error(`Supervisor exited; output: ${lines.join(" | ")}`);
        }
      }
      return matching();
    },
    /** Reads the remaining output after the supervisor exits. */
    async finish() {
      while (await read());
      return {
        exitCode: await child.exited,
        stderr: await new Response(child.stderr).text(),
      };
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
    expect((await supervisor.finish()).exitCode).toBe(0);
    expect(
      supervisor.lines.filter((line) => line.startsWith("stopped ")),
    ).toHaveLength(workers);
  });

  test("restarts a worker that exits", async () => {
    const supervisor = startSupervisor({
      WORKERS: "1",
      CRASH_ONCE: path.join(directory, "crashed-restart"),
    });
    await supervisor.waitFor(1, "crashing 0");
    await supervisor.waitFor(1, "started 0");

    supervisor.child.kill("SIGTERM");
    const { exitCode, stderr } = await supervisor.finish();
    expect(exitCode).toBe(0);
    expect(stderr).toContain("Worker 0 exited with code 1; restarting.");
  });

  test("does not restart a worker when stopped during the restart delay", async () => {
    const supervisor = startSupervisor({
      WORKERS: "1",
      CRASH_ONCE: path.join(directory, "crashed-delay"),
    });
    await supervisor.waitFor(1, "crashing 0");
    supervisor.child.kill("SIGTERM");
    expect((await supervisor.finish()).exitCode).toBe(0);
    expect(supervisor.lines).not.toContain("started 0");
  });

  test("stops with exit code 1 when workers keep exiting", async () => {
    const supervisor = startSupervisor({ WORKERS: "1", CRASH_ALWAYS: "1" });
    const { exitCode, stderr } = await supervisor.finish();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("workers keep exiting, stopping.");
  });

  test("kills workers that outlive the shutdown timeout", async () => {
    const supervisor = startSupervisor({
      IGNORE_SIGTERM: "1",
      SHUTDOWN_TIMEOUT: "0.2",
    });
    await supervisor.waitFor(workers, "started ");
    supervisor.child.kill("SIGTERM");
    const { exitCode, stderr } = await supervisor.finish();
    expect(exitCode).toBe(0);
    expect(stderr).toContain("did not stop within 0.2s; killing them.");
  });

  test("kills workers on a second signal", async () => {
    const supervisor = startSupervisor({ IGNORE_SIGTERM: "1" });
    await supervisor.waitFor(workers, "started ");
    supervisor.child.kill("SIGTERM");
    await supervisor.waitFor(workers, "stopped ");
    supervisor.child.kill("SIGTERM");
    expect((await supervisor.finish()).exitCode).toBe(0);
  });

  test.skipIf(process.platform === "linux")(
    "runs one worker where Bun cannot balance reusePort",
    async () => {
      const supervisor = startSupervisor({ WORKERS: "3" });
      await supervisor.waitFor(1, "started ");
      supervisor.child.kill("SIGTERM");
      const { exitCode, stderr } = await supervisor.finish();
      expect(exitCode).toBe(0);
      expect(
        supervisor.lines.filter((line) => line.startsWith("started ")),
      ).toHaveLength(1);
      expect(stderr).toContain("starting 1 worker instead of 3");
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
    await expect(
      supervise({ command: ["bun"], workers: 1, shutdownTimeout: -1 }),
    ).rejects.toThrow("shutdownTimeout");
  });
});
