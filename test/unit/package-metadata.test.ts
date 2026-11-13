import { expect, test } from "bun:test";

import manifest from "../../package.json";

// astro.build/integrations only fetches npm packages tagged with one of its
// discovery keywords, then files them under Adapters by `astro-adapter`.
test("is listed under Adapters in the Astro integrations library", () => {
  expect(manifest.keywords).toContain("astro-adapter");
  expect(
    ["astro-integration", "withastro", "astro-component"].some((keyword) =>
      manifest.keywords.includes(keyword),
    ),
  ).toBe(true);
});
