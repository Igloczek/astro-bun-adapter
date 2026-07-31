import type { Options, VitePlugin } from "./types.js";
import { PACKAGE_NAME } from "./config.js";

const VIRTUAL_CONFIG_ID = "virtual:igloczek-astro-bun-adapter:config";
const RESOLVED_VIRTUAL_CONFIG_ID = `\0${VIRTUAL_CONFIG_ID}`;
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
      filter: { id: new RegExp(`^${VIRTUAL_CONFIG_ID}$`) },
      handler() {
        return RESOLVED_VIRTUAL_CONFIG_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^${RESOLVED_VIRTUAL_CONFIG_ID}$`) },
      handler() {
        return Object.entries(config)
          .map(
            ([key, value]) => `export const ${key} = ${JSON.stringify(value)};`,
          )
          .join("\n");
      },
    },
  };
}
