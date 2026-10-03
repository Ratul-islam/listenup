import { FastifyRequest } from "fastify";

export function getIP(request: FastifyRequest): string {
  const xForwardedFor = request.headers["x-forwarded-for"];

  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }

  return request.ip;
}
