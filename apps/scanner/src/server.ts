import Fastify from "fastify";
import { config } from "./config.js";

export async function startServer(): Promise<void> {
  const fastify = Fastify({ logger: true });

  fastify.get("/health", async () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString(),
    };
  });

  await fastify.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[server] Health check server listening on port ${config.port}`);
}
