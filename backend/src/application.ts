import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { connectDB, disconnectDB } from "./config/db.js";
import { API_PREFIX } from "./config/constants.js";
import { env, ttsProviderName } from "./config/env.js";
import { queue, startQueue } from "./lib/queue.js";
import { startExportsWorker } from "./modules/exports/exports.worker.js";
import { startExpressionsWorker } from "./modules/expressions/expressions.worker.js";
import { startIngestionWorker } from "./modules/ingestion/ingestion.worker.js";
import { startUsersWorker } from "./modules/users/users.worker.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Zod schemas on routes validate request bodies/params/querystrings
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await connectDB();
  app.addHook("onClose", disconnectDB);

  // Background jobs (document processing) live in Postgres via pg-boss
  await startQueue();
  if (env.RUN_WORKERS) {
    await startIngestionWorker();
    await startExpressionsWorker();
    await startUsersWorker();
    await startExportsWorker();
  }
  app.addHook("onClose", () => queue.stop({ graceful: true }));
  app.log.info(`Speech provider: ${ttsProviderName}`);

  await app.register(AutoLoad, {
    dir: path.join(__dirname, "plugins"),
    encapsulate: false, 
  });

  await app.register(AutoLoad, {
    dir: path.join(__dirname, "modules"),
    matchFilter:  (p) => /\.routes\.(ts|js)$/.test(p),
    options: { prefix: API_PREFIX },
  });


  app.ready(() => {
    console.log(app.printRoutes());
  });

  return app;
}
