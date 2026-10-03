import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import { env } from "../config/env.js";

export default fp(async (app) => {
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
  });
});
