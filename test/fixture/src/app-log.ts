import { appendFileSync } from "node:fs";

// Records which processes evaluate app modules, so the worker tests can check
// that the supervisor never runs app code.
export function logAppModule(name: string) {
  if (process.env.FIXTURE_APP_LOG) {
    appendFileSync(process.env.FIXTURE_APP_LOG, `${name} ${process.pid}\n`);
  }
}
