import type { APIRoute, GetStaticPaths } from "astro";

export const prerender = true;

export const getStaticPaths = (() => [
  { params: { id: "known" } },
]) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => Response.json({ id: params.id });
