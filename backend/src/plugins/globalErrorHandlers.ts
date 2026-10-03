import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendError } from "../utils/responses.js";
import { isProduction } from "../config/env.js";

export default async function errorHandler(app: FastifyInstance) {
  console.log("from global error")
  app.setErrorHandler((error: any, request: FastifyRequest, reply: FastifyReply) => {
    if (error.code === "FST_ERR_VALIDATION" || error.validation) {
      return sendError(reply, {
        statusCode: 400,
        message: "Validation error",
        code: "VALIDATION_ERROR",
        errors: {
          message: error.message,
          details: error.validation ?? [],
        },
      });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);

    return sendError(reply, {
      statusCode,
      message:
        statusCode >= 500 && isProduction
          ? "Internal Server Error"
          : error.message ?? "Internal Server Error",
      code: error.name === "AppError" ? error.code : undefined,
    });
  });
}
