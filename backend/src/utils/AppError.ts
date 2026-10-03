export class AppError extends Error {
  statusCode: number
  // Machine-readable code the frontend can branch on, e.g. EMAIL_NOT_VERIFIED
  code?: string
  constructor(message: string, statusCode = 400, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.name = 'AppError'
  }
}
