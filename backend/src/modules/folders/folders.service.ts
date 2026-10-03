import type { Folder } from '../../generated/prisma/client.js'
import { AppError } from '../../utils/AppError.js'
import type { FoldersRepository } from './folders.repository.js'

const MAX_FOLDERS = 100

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002'
const taken = (name: string) => new AppError(`You already have a folder called "${name}"`, 409, 'FOLDER_EXISTS')

const toFolder = (f: Folder & { _count: { documents: number } }) => ({
  id: f.id,
  name: f.name,
  itemCount: f._count.documents,
  createdAt: f.createdAt,
})

/** Folders on the Soundshelf; a document sits in one folder or loose on the shelf */
export class FoldersService {
  constructor(private readonly foldersRepository: FoldersRepository) {}

  private async owned(userId: string, id: string) {
    const folder = await this.foldersRepository.findOwned(userId, id)
    if (!folder) throw new AppError('Folder not found', 404, 'FOLDER_NOT_FOUND')
    return folder
  }

  async list(userId: string) {
    const folders = await this.foldersRepository.list(userId)
    return folders.map(toFolder).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  }

  async get(userId: string, id: string) {
    return toFolder(await this.owned(userId, id))
  }

  async create(userId: string, name: string) {
    if ((await this.foldersRepository.count(userId)) >= MAX_FOLDERS) {
      throw new AppError(`You can have up to ${MAX_FOLDERS} folders`, 400, 'TOO_MANY_FOLDERS')
    }
    try {
      return toFolder(await this.foldersRepository.create(userId, name))
    } catch (e) {
      if (isUniqueViolation(e)) throw taken(name)
      throw e
    }
  }

  async rename(userId: string, id: string, name: string) {
    await this.owned(userId, id)
    try {
      return toFolder(await this.foldersRepository.rename(id, name))
    } catch (e) {
      if (isUniqueViolation(e)) throw taken(name)
      throw e
    }
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id)
    await this.foldersRepository.delete(id)
  }
}
