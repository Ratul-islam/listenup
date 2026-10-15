import type { FastifyRequest } from 'fastify'

// A podcast feed's address carries its secret: /podcast/<token>/feed.xml, /podcast/<token>/episodes/…
const PODCAST_SECRET = /(\/podcast\/)[^/?]+(?=\/(?:feed\.xml|episodes\/))/
// Signed links (local files, storage) and anything else that passes a secret in the query
const SECRET_PARAMS = /([?&](?:token|sig|signature|key|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&#]*/gi

/** The address as it's logged: secrets in it replaced, so log access isn't access to feeds or files */
export const loggedUrl = (url: string) => url.replace(PODCAST_SECRET, '$1[hidden]').replace(SECRET_PARAMS, '$1[hidden]')

/** Fastify's request log line (the same fields as its own), with loggedUrl */
export function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: loggedUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  }
}
