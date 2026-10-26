import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "astro-bun-package-"));
const archive = path.join(temporary, "adapter.tgz");
const unpacked = path.join(temporary, "unpacked");

async function run(command: string[]) {
  const process = Bun.spawn(command, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await process.exited, 0, `${command.join(" ")} failed`);
}

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? files(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

try {
  await run(["bun", "run", "build"]);
  // Consumers can't resolve the build-time virtual modules, so the published
  // declarations must type every entry export without them.
  await run(["bunx", "tsc", "-p", "test/types/tsconfig.json"]);
  await run([
    "bun",
    "pm",
    "pack",
    "--filename",
    archive,
    "--ignore-scripts",
    "--quiet",
  ]);
  await run(["mkdir", "-p", unpacked]);
  await run(["tar", "-xzf", archive, "-C", unpacked]);

  const packageRoot = path.join(unpacked, "package");
  const packedFiles = (await files(packageRoot)).map((file) =>
    path.relative(packageRoot, file),
  );
  assert.ok(packedFiles.includes("README.md"));
  assert.ok(packedFiles.includes("LICENSE"));
  assert.ok(packedFiles.includes("dist/index.js"));
  assert.ok(packedFiles.includes("dist/index.d.ts"));
  assert.ok(
    packedFiles.every(
      (file) =>
        file === "README.md" ||
        file === "LICENSE" ||
        file === "package.json" ||
        file.startsWith("dist/"),
    ),
    `Unexpected packed files: ${packedFiles.join(", ")}`,
  );
  assert.ok(
    packedFiles.every(
      (file) => !file.endsWith(".ts") || file.endsWith(".d.ts"),
    ),
    "Source TypeScript was included in the package",
  );
  assert.ok(
    packedFiles.every((file) => !file.endsWith(".tsbuildinfo")),
    "TypeScript build metadata was included in the package",
  );

  for (const file of packedFiles.filter((name) => name.endsWith(".d.ts"))) {
    const declaration = await readFile(path.join(packageRoot, file), "utf8");
    assert.ok(
      !declaration.includes("virtual:"),
      `${file} imports a virtual module consumers can't resolve`,
    );
  }

  // Nothing reached here may load Astro or the app: the main entry's static
  // imports run in the supervisor process, which lives as long as the
  // workers, and the server entry's static imports run before a worker
  // watches its supervisor (the entry loads Astro with a dynamic import
  // afterwards). `astro/errors` is small and validates the integration's
  // options.
  const scanner = new Bun.Transpiler({ loader: "js" });
  async function assertNoPackages(
    start: string,
    allowed: readonly string[] = [],
  ) {
    const reached = new Set<string>();
    const pending = [start];
    while (pending.length) {
      const file = pending.pop()!;
      if (reached.has(file)) continue;
      reached.add(file);
      const source = await readFile(path.join(packageRoot, file), "utf8");
      for (const { path: specifier, kind } of scanner.scanImports(source)) {
        if (kind === "dynamic-import") continue;
        if (specifier.startsWith(".")) {
          pending.push(path.posix.join(path.posix.dirname(file), specifier));
        } else {
          assert.ok(
            specifier.startsWith("node:") ||
              specifier.startsWith("virtual:igloczek-astro-bun-adapter:") ||
              allowed.includes(specifier),
            `${file} imports ${specifier}, reached from ${start} before the app may load`,
          );
        }
      }
    }
  }
  await assertNoPackages("dist/index.js", ["astro/errors"]);
  await assertNoPackages("dist/server.js");

  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as { name: string; version: string };
  assert.equal(manifest.name, "@igloczek/astro-bun-adapter");
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
  console.log(
    `${manifest.name}@${manifest.version}: ${packedFiles.length} files verified`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
