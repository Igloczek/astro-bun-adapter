import type { APIRoute } from "astro";

export const prerender = false;

// A 1x1 PNG rendered on demand, so it only exists as a dynamic route.
const pixel = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

export const GET: APIRoute = () =>
  new Response(pixel, { headers: { "Content-Type": "image/png" } });
