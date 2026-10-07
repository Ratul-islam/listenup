import fp from "fastify-plugin";
import compress from "@fastify/compress";

// JSON replies are gzipped for the phone (it asks for gzip and unpacks it by itself). A long
// script's parts were 458 KB uncompressed in the load test (Oct 2026), 7.6 KB gzipped. Audio
// isn't compressible and is skipped. gzip only, at the fastest level: on a 0.5-CPU server the
// default level cost about a quarter of the throughput (brotli would cost more).
export default fp(async (app) => {
  await app.register(compress, { global: true, threshold: 1024, encodings: ["gzip"], zlibOptions: { level: 1 } });
});
