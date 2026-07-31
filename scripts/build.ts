import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await Promise.all([
  rm(new URL("../dist", import.meta.url), { recursive: true, force: true }),
  rm(new URL("../.cache", import.meta.url), { recursive: true, force: true }),
]);

const compiler = Bun.spawn(["bunx", "tsc", "-b", "tsconfig.build.json"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
process.exitCode = await compiler.exited;
