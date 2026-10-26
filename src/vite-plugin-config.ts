import type { Options, VitePlugin } from "./types.js";
import { PACKAGE_NAME } from "./config.js";

const VIRTUAL_CONFIG_ID = "virtual:igloczek-astro-bun-adapter:config";
const RESOLVED_VIRTUAL_CONFIG_ID = `\0${VIRTUAL_CONFIG_ID}`;
const SERVER_ENVIRONMENTS = new Set(["ssr", "prerender", "astro"]);

const UNSAFE_CHARS: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/** A JavaScript literal for `value`, safe to embed in generated code. */
export function toLiteral(value: unknown) {
  const json = JSON.stringify(value);
  if (json === undefined) return "undefined";
  return json.replace(/[<>\u2028\u2029]/g, (char) => UNSAFE_CHARS[char]!);
}

export function createConfigPlugin(config: Options): VitePlugin {
  return {
    name: VIRTUAL_CONFIG_ID,
    configEnvironment(environmentName) {
      if (SERVER_ENVIRONMENTS.has(environmentName)) {
        return { resolve: { noExternal: [PACKAGE_NAME] } };
      }
    },
    resolveId: {
      filter: { id: new RegExp(`^${VIRTUAL_CONFIG_ID}$`) },
      handler() {
        return RESOLVED_VIRTUAL_CONFIG_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^${RESOLVED_VIRTUAL_CONFIG_ID}$`) },
      handler() {
        return Object.entries(config)
          .map(([key, value]) => `export const ${key} = ${toLiteral(value)};`)
          .join("\n");
      },
    },
  };
}
