import { FastifyReply } from 'fastify'

interface SuccessOptions<T> {
  data?: null |  T
  message?: string
  statusCode?: number
}

interface ErrorOptions {
  message: string
  statusCode?: number
  code?: string
  errors?: any
}

export const sendSuccess = <T>(
  reply: FastifyReply,
  { data = null, message = 'Success', statusCode = 200 }: SuccessOptions<T> = {}
) => {
  // const { data = null, message = 'Success', statusCode = 200 } = options
  return reply.status(statusCode).send({
    status: 'success',
    message,
    data,
  })
}

export const sendError = (
  reply: FastifyReply,
  { message, statusCode = 400, code, errors = null }: ErrorOptions
) => {
  // const { message, statusCode = 400, errors = null } = options
  return reply.status(statusCode).send({
    status: 'error',
    message,
    ...(code && { code }),
    errors,
  })
}
