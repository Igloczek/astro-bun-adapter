import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
  resolve(process.env.SERVER_ENTRY ?? "dist/server/entry.mjs"),
).href;
process.env.ASTRO_BUN_AUTOSTART = "disabled";
process.env.ASTRO_BUN_LOGGING = "disabled";
const serverModule = await import(entry);

let stop: () => Promise<void>;
let port: number;

if (process.env.ADAPTER_MODE === "middleware") {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bunServer) {
      return serverModule.handler(request, {
        clientAddress: "127.0.0.1",
        serverPort: bunServer.port,
        locals: { message: "middleware" },
      });
    },
  });
  port = server.port ?? 0;
  stop = () => server.stop();
} else {
  const running = serverModule.startServer();
  port = running.server.port ?? 0;
  stop = running.stop;
}

console.log(JSON.stringify({ port }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await stop();
    process.exit(0);
  });
}
