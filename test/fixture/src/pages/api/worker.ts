import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  Response.json({
    worker: process.env.ASTRO_BUN_WORKER ?? null,
    setup: process.env.FIXTURE_SETUP ?? null,
  });
