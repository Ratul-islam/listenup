import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { getIP } from "../utils/getIp.js";

// Opt-in per route via `config: { rateLimit: { max, timeWindow } }`
export default fp(async (app) => {
  await app.register(rateLimit, {
    global: false,
    keyGenerator: getIP,
  });
});
