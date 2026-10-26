// Type-checked against the built package by scripts/package-check.ts. Each
// `@ts-expect-error` fails the check if the export's type degrades to `any`.
import bun, {
  supervise,
  type BunRequestContext,
  type RequestHandler,
  type SuperviseOptions,
} from "@igloczek/astro-bun-adapter";
import {
  handler,
  options,
  startServer,
} from "@igloczek/astro-bun-adapter/server.js";

bun({ mode: "middleware", shutdownTimeout: 30, trustedProxies: ["10.0.0.1"] });
// @ts-expect-error `mode` is required.
bun({});
// @ts-expect-error `workers` was removed; use `supervise()`.
bun({ mode: "standalone", workers: 2 });

const context: BunRequestContext = { clientAddress: "::1", serverPort: 3000 };
const response: Promise<Response> = handler(new Request("http://x/"), context);
const typedHandler: RequestHandler = handler;
// @ts-expect-error `handler` returns a Response promise.
const notResponse: Promise<string> = handler(new Request("http://x/"));

const port: number = options.port;
const mode: "middleware" | "standalone" = options.mode;
// @ts-expect-error `options.port` is a number.
const notPort: string = options.port;

const stopped: Promise<void> = startServer().stop();

const supervision: SuperviseOptions = {
  command: [process.execPath, "./server.ts"],
  workers: 2,
  shutdownTimeout: 30,
};
const supervised: Promise<never> = supervise(supervision);
// @ts-expect-error `command` is required.
const noCommand: Promise<never> = supervise({ workers: 2 });

export {
  mode,
  noCommand,
  notPort,
  notResponse,
  port,
  response,
  stopped,
  supervised,
  typedHandler,
};
