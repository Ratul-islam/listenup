import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { connectDB, disconnectDB } from "./config/db.js";
import { API_PREFIX } from "./config/constants.js";
import { env, isProduction, ttsProviderName } from "./config/env.js";
import { queue, startQueue } from "./lib/queue.js";
import { startWorkers } from "./workers.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  // Behind a proxy in production (Vercel, Railway…): take the client IP from X-Forwarded-For, so rate limits are per user
  const app = Fastify({ logger: true, trustProxy: isProduction });

  // Zod schemas on routes validate request bodies/params/querystrings
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await connectDB();
  app.addHook("onClose", disconnectDB);

  // Background jobs (document processing) live in Postgres via pg-boss
  await startQueue();
  if (env.RUN_WORKERS) await startWorkers();
  app.addHook("onClose", () => queue.stop({ graceful: true }));
  app.log.info(`Speech provider: ${ttsProviderName}`);

  await app.register(AutoLoad, {
    dir: path.join(__dirname, "plugins"),
    encapsulate: false, 
  });

  // For hosts' health checks (no auth, no database work)
  app.get(`${API_PREFIX}/health`, async () => ({ status: "ok" }));

  await app.register(AutoLoad, {
    dir: path.join(__dirname, "modules"),
    matchFilter:  (p) => /\.routes\.(ts|js)$/.test(p),
    options: { prefix: API_PREFIX },
  });


  if (!isProduction) app.ready(() => console.log(app.printRoutes()));

  return app;
}
