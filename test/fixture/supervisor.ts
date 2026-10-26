import { supervise } from "@igloczek/astro-bun-adapter/supervisor";

// One-time setup before the workers start, like migrations. Workers inherit
// the environment, so this shows where it ran.
process.env.FIXTURE_SETUP = `${process.pid} setup`;

await supervise({
  command: [
    process.execPath,
    process.env.FIXTURE_WORKER_SCRIPT ?? "dist/server/entry.mjs",
  ],
  workers: Number(process.env.FIXTURE_WORKERS ?? 2),
  ...(process.env.FIXTURE_SHUTDOWN_TIMEOUT
    ? { shutdownTimeout: Number(process.env.FIXTURE_SHUTDOWN_TIMEOUT) }
    : {}),
});
