import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { UsersService } from './users.service.js'
import type { UpdateProfileBody } from './users.schema.js'

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  getMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await this.usersService.getProfile(request.user.sub)
    return sendSuccess(reply, { data: { user } })
  }

  updateMe = async (request: FastifyRequest<{ Body: UpdateProfileBody }>, reply: FastifyReply) => {
    const user = await this.usersService.updateProfile(request.user.sub, request.body)
    return sendSuccess(reply, { message: 'Profile updated', data: { user } })
  }

  closeMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.usersService.closeAccount(request.user.sub)
    return sendSuccess(reply, { message: 'Account closed', data })
  }
}
