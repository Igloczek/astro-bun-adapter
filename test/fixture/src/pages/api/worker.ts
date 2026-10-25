import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(process.env.ASTRO_BUN_WORKER ?? "unsupervised");
