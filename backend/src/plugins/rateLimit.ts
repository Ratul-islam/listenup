import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import { getIP } from "../utils/getIp.js";

/**
 * Signed-in requests count per account, so many people behind one mobile
 * network's address don't share a limit, and one account can't spread its
 * requests over several addresses. Everything else counts per address.
 */
const keyOf = (request: FastifyRequest) => {
  const userId = (request.user as { sub?: string } | null | undefined)?.sub;
  return userId ? `user:${userId}` : getIP(request);
};

// Opt-in per route via `config: { rateLimit: { max, timeWindow } }`. It runs as a
// preHandler, after the sign-in check (verifyAccess) has set request.user
export default fp(async (app) => {
  await app.register(rateLimit, {
    global: false,
    hook: "preHandler",
    keyGenerator: keyOf,
  });
});
