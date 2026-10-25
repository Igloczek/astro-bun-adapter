import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  Response.json({
    worker: process.env.ASTRO_BUN_WORKER ?? null,
    beforeStart: process.env.FIXTURE_BEFORE_START ?? null,
  });
