import fp from "fastify-plugin";
import fastifyJwt, { type JwtVerifyFunction } from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  RESET_TOKEN_TTL,
} from "../config/constants.js";
import { AppError } from "../utils/AppError.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  // Refresh token row id
  jti: string;
  // Rotation family id
  fid: string;
}

export interface ResetTokenPayload {
  sub: string;
  otpId: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    namespaces: "access" | "refresh" | "reset";
    payload: AccessTokenPayload | RefreshTokenPayload | ResetTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    accessJwtVerify: JwtVerifyFunction;
  }
  interface FastifyInstance {
    verifyAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    namespace: "access",
    sign: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  });

  app.register(fastifyJwt, {
    secret: env.JWT_REFRESH_SECRET,
    namespace: "refresh",
    sign: { expiresIn: REFRESH_TOKEN_TTL_SECONDS },
  });

  app.register(fastifyJwt, {
    secret: env.JWT_PASS_RESET_SECRET,
    namespace: "reset",
    sign: { expiresIn: RESET_TOKEN_TTL },
  });

  // preHandler for protected routes; sets request.user from the Bearer access token
  app.decorate("verifyAccess", async (request: FastifyRequest) => {
    try {
      await request.accessJwtVerify();
    } catch (err: any) {
      if (err?.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED") {
        throw new AppError("Access token expired", 401, "TOKEN_EXPIRED");
      }
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }
  });
});
