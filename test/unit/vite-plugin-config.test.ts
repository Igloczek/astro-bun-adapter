import { describe, expect, test } from "bun:test";

import type { Options } from "../../src/types.ts";
import { createConfigPlugin, toLiteral } from "../../src/vite-plugin-config.ts";

// Line and paragraph separators, built at runtime to keep this file ASCII.
const separators = String.fromCharCode(0x2028, 0x2029);
const unsafe = `</script><!--${separators}`;
const unsafeChars = new RegExp(`[<>${separators}]`);

describe("generated config modules", () => {
  test("literals escape unsafe characters and keep their values", () => {
    for (const value of [
      unsafe,
      ["./a.ts", unsafe],
      { key: unsafe },
      1,
      null,
    ]) {
      const literal = toLiteral(value);
      expect(literal).not.toMatch(unsafeChars);
      expect(new Function(`return ${literal};`)()).toEqual(value);
    }
    expect(toLiteral(undefined)).toBe("undefined");
  });

  test("beforeStart specifiers are embedded as escaped literals", () => {
    const plugin = createConfigPlugin({
      beforeStart: [`./${unsafe}.ts`],
    } as Options) as {
      load: { handler: (id: string) => string };
    };
    const code = plugin.load.handler(
      "\0virtual:igloczek-astro-bun-adapter:before-start",
    );
    expect(code).not.toContain("</script>");
    expect(code).not.toMatch(new RegExp(`[${separators}]`));
    expect(code).toContain(toLiteral(`./${unsafe}.ts`));
  });
});
