import type { BaseApp } from "astro/app";

import { createAppHandler } from "./serve-app.js";
import type { Options, RequestHandler } from "./types.js";

export default function createMiddleware(
  app: BaseApp,
  options: Options,
): RequestHandler {
  return createAppHandler(app, options);
}
