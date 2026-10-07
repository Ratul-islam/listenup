import type { FastifyRequest } from "fastify";

/**
 * The client's address, for rate limits and session records. Fastify works it
 * out from X-Forwarded-For with `trustProxy` (see application.ts), counting
 * only the entries the host's proxies added: the first entry is whatever the
 * client sent, and trusting it let anyone bypass every rate limit (load test,
 * Oct 2026).
 */
export function getIP(request: FastifyRequest): string {
  return request.ip;
}
