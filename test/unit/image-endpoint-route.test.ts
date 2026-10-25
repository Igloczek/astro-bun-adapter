import { describe, expect, test } from "bun:test";

import {
  findImageEndpointRoute,
  imageEndpointComponent,
} from "../../src/image-endpoint-route.ts";

const root = new URL("../../", import.meta.url);

describe("image endpoint route", () => {
  test("resolves entrypoints like Astro's route components", () => {
    expect(imageEndpointComponent("astro/assets/endpoint/generic", root)).toBe(
      "node_modules/astro/dist/assets/endpoint/generic.js",
    );
    expect(imageEndpointComponent("./src/custom-image.ts", root)).toBe(
      "src/custom-image.ts",
    );
  });

  test("uses the route Astro resolved, not the configured string", () => {
    const component = "node_modules/astro/dist/assets/endpoint/generic.js";
    const routes = [
      {
        entrypoint: "_server-islands.astro",
        origin: "internal",
        pattern: "/_server-islands/[name]",
        type: "page",
      },
      {
        entrypoint: "src/pages/images.ts",
        origin: "project",
        pattern: "/images-page",
        type: "endpoint",
      },
      // image.endpoint.route "/images/index.ts" is served at /images.
      {
        entrypoint: component,
        origin: "internal",
        pattern: "/images",
        type: "endpoint",
      },
    ] as const;
    expect(findImageEndpointRoute(routes, component)).toBe("/images");
    expect(findImageEndpointRoute(routes, "other.js")).toBeUndefined();
  });
});
