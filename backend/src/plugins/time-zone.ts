import fp from "fastify-plugin";
import { prisma } from "../config/db.js";

const HEADER = "x-time-zone";
// "Asia/Dhaka", "America/Argentina/Buenos_Aires", "Egypt", "UTC"
const VALID = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
// Users whose time zone this process has saved, so it's written once, then only when it changes
const saved = new Map<string, string>();
const MAX_REMEMBERED = 20_000;

/**
 * Remembers each signed-in user's phone time zone, which the app sends with
 * every request ("X-Time-Zone: Asia/Dhaka"). It places Free users, who have no
 * store country, in a region for ad and invite rewards.
 */
export default fp(async (app) => {
  app.addHook("onResponse", async (request) => {
    const userId = (request.user as { sub?: string } | null | undefined)?.sub;
    const timeZone = request.headers[HEADER];
    if (!userId || typeof timeZone !== "string" || timeZone.length > 64 || !VALID.test(timeZone) || saved.get(userId) === timeZone) return;
    if (saved.size > MAX_REMEMBERED) saved.clear();
    saved.set(userId, timeZone);
    await prisma.user.updateMany({ where: { id: userId }, data: { timeZone } }).catch((e) => {
      saved.delete(userId);
      request.log.warn({ err: e }, "time zone not saved");
    });
  });
});
