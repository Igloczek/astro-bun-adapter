import sharp from "astro/assets/services/sharp";
import type { LocalImageService } from "astro";

// Path-aware local service: it only accepts requests at the configured
// endpoint route, so adapters must pass the original request URL to parseURL.
const service: LocalImageService = {
  ...sharp,
  parseURL(url, imageConfig, ...rest) {
    if (!url.pathname.endsWith("/images")) return undefined;
    return sharp.parseURL(url, imageConfig, ...rest);
  },
};

export default service;
