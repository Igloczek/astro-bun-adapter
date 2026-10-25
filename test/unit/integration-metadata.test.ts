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

async function runConfigSetup(session: unknown) {
  const integration = createIntegration({ mode: "standalone" });
  const setup = integration.hooks["astro:config:setup"] as unknown as (
    options: Record<string, unknown>,
  ) => Promise<void>;
  const updates: Record<string, unknown>[] = [];
  const messages: string[] = [];
  await setup({
    command: "build",
    config: {
      build: {
        client: new URL("file:///project/dist/client/"),
        server: new URL("file:///project/dist/server/"),
      },
      cacheDir: new URL("file:///project/node_modules/.astro/"),
      image: { endpoint: {} },
      server: { host: false, port: 4321 },
      session,
    },
    logger: { info: (message: string) => messages.push(message) },
    updateConfig: (update: Record<string, unknown>) => updates.push(update),
  });
  return { messages, session: updates[0]?.session };
}

test("enables filesystem sessions when no driver is configured", async () => {
  const { messages, session } = await runConfigSetup({ ttl: 60 });
  expect(messages).toEqual(["Enabling sessions with filesystem storage"]);
  expect(session).toMatchObject({ ttl: 60, driver: expect.anything() });
});

test("respects session: false", async () => {
  const { messages, session } = await runConfigSetup(false);
  expect(messages).toEqual([]);
  expect(session).toBe(false);
});
