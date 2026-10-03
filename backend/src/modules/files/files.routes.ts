import type { FastifyPluginAsync } from 'fastify'
import { LocalStorage } from '../../lib/storage/local-storage.js'
import { verifyFileToken } from '../../lib/storage/file-token.js'
import { AppError } from '../../utils/AppError.js'

const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf', txt: 'text/plain' }

/**
 * Serves locally stored files behind short-lived signed links (the S3 driver
 * uses presigned URLs instead). Supports Range requests for audio seeking.
 */
const filesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { '*': string }; Querystring: { exp?: string; sig?: string } }>('/*', async (request, reply) => {
    const key = decodeURIComponent(request.params['*'])
    const exp = Number(request.query.exp)
    if (!request.query.sig || !Number.isFinite(exp) || !verifyFileToken(key, exp, request.query.sig)) {
      throw new AppError('This link has expired', 403, 'INVALID_FILE_LINK')
    }

    const stat = await LocalStorage.stat(key).catch(() => null)
    if (!stat) throw new AppError('File not found', 404, 'FILE_NOT_FOUND')

    const type = MIME[key.split('.').pop() ?? ''] ?? 'application/octet-stream'
    reply.header('Accept-Ranges', 'bytes').header('Content-Type', type).header('Cache-Control', 'private, max-age=3600')

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '')
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(stat.size - Number(range[2]), 0)
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1
      if (start >= stat.size || start > end) {
        return reply.code(416).header('Content-Range', `bytes */${stat.size}`).send()
      }
      reply.code(206).header('Content-Range', `bytes ${start}-${end}/${stat.size}`).header('Content-Length', end - start + 1)
      return reply.send(LocalStorage.openStream(key, { start, end }))
    }

    reply.header('Content-Length', stat.size)
    return reply.send(LocalStorage.openStream(key))
  })
}

export default filesRoutes
