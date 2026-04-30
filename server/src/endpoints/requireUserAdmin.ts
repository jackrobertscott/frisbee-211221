import {IncomingMessage} from 'http'
import {StatusCodes} from 'http-status-codes'
import {requireUser} from './requireUser'

export const requireUserAdmin = async (req: IncomingMessage) => {
  const [user, session] = await requireUser(req)
  if (!user.admin) {
    const error: any = new Error(`Failed because user is not an admin.`)
    error.statusCode = StatusCodes.FORBIDDEN
    throw error
  }
  return [user, session] as const
}
