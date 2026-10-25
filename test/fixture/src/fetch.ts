import { appendFileSync } from "node:fs";

import { DefaultFetchHandler } from "astro/app/fetch/default-handler";

import { logAppModule } from "./app-log";

logAppModule("fetch");

// App-owned cleanup on shutdown, like closing a job queue: the server must
// let it finish instead of exiting once HTTP requests are drained.
const cleanupLog = process.env.FIXTURE_CLEANUP_LOG;
if (cleanupLog) {
  process.on("SIGTERM", async () => {
    await Bun.sleep(300);
    appendFileSync(cleanupLog, "cleaned up\n");
  });
}

export default new DefaultFetchHandler();
