import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { IntegrationResolvedRoute } from "astro";

const require = createRequire(import.meta.url);

/** Resolves an image endpoint entrypoint the way Astro records route components. */
export function imageEndpointComponent(entrypoint: string, root: URL) {
  const rootPath = fileURLToPath(root);
  let resolved: string;
  try {
    resolved = require.resolve(entrypoint, { paths: [rootPath] });
  } catch {
    resolved = fileURLToPath(new URL(entrypoint, root));
  }
  return path.relative(rootPath, resolved).split(path.sep).join("/");
}

/**
 * Returns the route Astro actually serves the image endpoint on. Astro
 * normalizes `image.endpoint.route` (e.g. `/images/index.ts` → `/images`), so
 * the configured string is not a reliable identity.
 */
export function findImageEndpointRoute(
  routes: readonly Pick<
    IntegrationResolvedRoute,
    "entrypoint" | "origin" | "pattern" | "type"
  >[],
  component: string,
) {
  return routes.find(
    (route) =>
      route.origin === "internal" &&
      route.type === "endpoint" &&
      route.entrypoint === component,
  )?.pattern;
}
