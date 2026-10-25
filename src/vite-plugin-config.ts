import type { Options, VitePlugin } from "./types.js";
import { PACKAGE_NAME } from "./config.js";

const VIRTUAL_CONFIG_ID = "virtual:igloczek-astro-bun-adapter:config";
const RESOLVED_VIRTUAL_CONFIG_ID = `\0${VIRTUAL_CONFIG_ID}`;
const VIRTUAL_BEFORE_START_ID =
  "virtual:igloczek-astro-bun-adapter:before-start";
const RESOLVED_VIRTUAL_BEFORE_START_ID = `\0${VIRTUAL_BEFORE_START_ID}`;
const SERVER_ENVIRONMENTS = new Set(["ssr", "prerender", "astro"]);

export function createConfigPlugin(config: Options): VitePlugin {
  return {
    name: VIRTUAL_CONFIG_ID,
    configEnvironment(environmentName) {
      if (SERVER_ENVIRONMENTS.has(environmentName)) {
        return { resolve: { noExternal: [PACKAGE_NAME] } };
      }
    },
    resolveId: {
      filter: {
        id: new RegExp(`^(${VIRTUAL_CONFIG_ID}|${VIRTUAL_BEFORE_START_ID})$`),
      },
      handler(id) {
        return `\0${id}`;
      },
    },
    load: {
      filter: {
        id: new RegExp(
          `^(${RESOLVED_VIRTUAL_CONFIG_ID}|${RESOLVED_VIRTUAL_BEFORE_START_ID})$`,
        ),
      },
      handler(id) {
        const { beforeStart, ...options } = config;
        if (id === RESOLVED_VIRTUAL_BEFORE_START_ID) {
          // Imported on demand, so workers never evaluate the module.
          return beforeStart === undefined
            ? "export default async () => {};"
            : `export default async () => {
  const module = await import(${JSON.stringify(beforeStart)});
  if (typeof module.default === "function") await module.default();
};`;
        }
        return Object.entries(options)
          .map(
            ([key, value]) => `export const ${key} = ${JSON.stringify(value)};`,
          )
          .join("\n");
      },
    },
  };
}
