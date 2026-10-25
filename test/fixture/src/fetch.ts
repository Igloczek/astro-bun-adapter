import { appendFileSync } from "node:fs";

import { DefaultFetchHandler } from "astro/app/fetch/default-handler";

// Records every process that evaluates the app's fetch handler, so the worker
// tests can check the supervisor never runs app code.
if (process.env.FIXTURE_FETCH_LOG) {
  appendFileSync(process.env.FIXTURE_FETCH_LOG, `${process.pid}\n`);
}

export default new DefaultFetchHandler();
