import type { FastifyPluginAsync } from 'fastify'
import { env } from '../../config/env.js'
import { LocalStorage } from '../../lib/storage/local-storage.js'
import { uploadTokenSubject, verifyFileToken } from '../../lib/storage/file-token.js'
import { AppError } from '../../utils/AppError.js'

const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf', txt: 'text/plain' }

/**
 * Local-disk stand-in for presigned S3 links (dev only): GET serves files
 * behind short-lived signed links, with Range support for audio seeking;
 * PUT accepts uploads behind signed links that fix the type and size.
 */
const filesRoutes: FastifyPluginAsync = async (app) => {
  // Upload bodies arrive raw (application/pdf, image/jpeg…); only this plugin parses them
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: env.MAX_UPLOAD_MB * 1024 * 1024 }, (_req, body, done) => done(null, body))

  app.put<{ Params: { '*': string }; Querystring: { exp?: string; size?: string; sig?: string } }>('/*', async (request, reply) => {
    const key = decodeURIComponent(request.params['*'])
    const exp = Number(request.query.exp)
    const size = Number(request.query.size)
    const type = request.headers['content-type'] ?? ''
    const body = request.body as Buffer
    if (!request.query.sig || !Number.isFinite(exp) || !verifyFileToken(uploadTokenSubject(key, type, size), exp, request.query.sig)) {
      throw new AppError('This upload link has expired or does not match the file', 403, 'INVALID_FILE_LINK')
    }
    if (!Buffer.isBuffer(body) || body.length !== size) throw new AppError('The file size does not match', 403, 'INVALID_FILE_LINK')
    await new LocalStorage().put(key, body)
    return reply.code(200).send()
  })

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
