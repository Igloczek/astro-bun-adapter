// Type-checked against the built package by scripts/package-check.ts. Each
// `@ts-expect-error` fails the check if the export's type degrades to `any`.
import bun, {
  type BunRequestContext,
  type RequestHandler,
} from "@igloczek/astro-bun-adapter";
import {
  beforeStart,
  handler,
  options,
  startServer,
} from "@igloczek/astro-bun-adapter/server.js";

bun({ mode: "middleware", workers: 2, trustedProxies: ["10.0.0.1"] });
// @ts-expect-error `mode` is required.
bun({});

const context: BunRequestContext = { clientAddress: "::1", serverPort: 3000 };
const response: Promise<Response> = handler(new Request("http://x/"), context);
const typedHandler: RequestHandler = handler;
// @ts-expect-error `handler` returns a Response promise.
const notResponse: Promise<string> = handler(new Request("http://x/"));

const run: Promise<void> = beforeStart();
// @ts-expect-error `beforeStart` is a function.
const notFunction: number = beforeStart;

const port: number = options.port;
const mode: "middleware" | "standalone" = options.mode;
// @ts-expect-error `options.port` is a number.
const notPort: string = options.port;

const stopped: Promise<void> = startServer().stop();

export {
  mode,
  notFunction,
  notPort,
  notResponse,
  port,
  response,
  run,
  stopped,
  typedHandler,
};
