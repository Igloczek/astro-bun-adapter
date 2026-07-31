import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  return Response.json({
    address: clientAddress,
    body: await request.text(),
    message: (locals as { message?: string }).message ?? "standalone",
  });
};
