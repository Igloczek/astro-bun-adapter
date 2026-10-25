import type { APIRoute } from "astro";

// Sends a first chunk at once, so a client knows the request is in flight.
export const GET: APIRoute = () =>
  new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode("started "));
        await Bun.sleep(500);
        controller.enqueue(new TextEncoder().encode("finished"));
        controller.close();
      },
    }),
  );
