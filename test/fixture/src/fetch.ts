import { appendFileSync } from "node:fs";

import { DefaultFetchHandler } from "astro/app/fetch/default-handler";

import { logAppModule } from "./app-log";

logAppModule("fetch");

// Slow async initialization, like connecting to a database: a worker must
// still notice a lost supervisor while it waits.
if (process.env.FIXTURE_SLOW_INIT) await Bun.sleep(10_000);

// App-owned cleanup on shutdown, like closing a job queue: the server must
// let it finish instead of exiting once HTTP requests are drained.
// `once` listeners remove themselves before they run, and an exit code the
// app sets must survive.
const cleanupLog = process.env.FIXTURE_CLEANUP_LOG;
if (cleanupLog) {
  const listen = process.env.FIXTURE_CLEANUP_ONCE ? "once" : "on";
  process[listen]("SIGTERM", async () => {
    await Bun.sleep(300);
    appendFileSync(cleanupLog, "cleaned up\n");
    if (process.env.FIXTURE_CLEANUP_EXIT_CODE) {
      process.exitCode = Number(process.env.FIXTURE_CLEANUP_EXIT_CODE);
    }
  });
  // Slow initialization after the cleanup handler is registered: a signal
  // in this gap must still stop the server, which must not start afterwards.
  if (process.env.FIXTURE_SLOW_START) {
    appendFileSync(cleanupLog, "registered\n");
    await Bun.sleep(Number(process.env.FIXTURE_SLOW_START));
  }
}

export default new DefaultFetchHandler();
