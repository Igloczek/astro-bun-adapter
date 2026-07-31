import { expect, test } from "bun:test";

import createIntegration, { getAdapter } from "../../src/index.ts";

test("declares the current Astro adapter contract", () => {
  const adapter = getAdapter({ staticHeaders: true });
  expect(adapter).toMatchObject({
    name: "@igloczek/astro-bun-adapter",
    entrypointResolution: "auto",
    serverEntrypoint: "@igloczek/astro-bun-adapter/server.js",
    previewEntrypoint: "@igloczek/astro-bun-adapter/preview.js",
    adapterFeatures: {
      buildOutput: "server",
      middlewareMode: "classic",
      staticHeaders: true,
    },
  });
});

test("requires an explicit runtime mode", () => {
  expect(() => createIntegration(undefined as never)).toThrow("options");
});
