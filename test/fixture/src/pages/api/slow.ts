import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  await Bun.sleep(500);
  return new Response("finished");
};
