import { prisma } from '../../config/db.js'
import { InvitesRepository } from './invites.repository.js'
import { InvitesService } from './invites.service.js'

export const createInvitesService = () => new InvitesService(new InvitesRepository(prisma))
