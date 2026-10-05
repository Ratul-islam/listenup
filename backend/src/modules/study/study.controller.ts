import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { StudyParams } from './study.schema.js'
import type { StudyService } from './study.service.js'

export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  get = async (request: FastifyRequest<{ Params: StudyParams }>, reply: FastifyReply) => {
    const { documentId, kind } = request.params
    return sendSuccess(reply, { data: await this.studyService.get(request.user.sub, documentId, kind) })
  }

  /** A new version, e.g. different quiz questions */
  refresh = async (request: FastifyRequest<{ Params: StudyParams }>, reply: FastifyReply) => {
    const { documentId, kind } = request.params
    return sendSuccess(reply, { data: await this.studyService.get(request.user.sub, documentId, kind, { fresh: true }) })
  }
}
