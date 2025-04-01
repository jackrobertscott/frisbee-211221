import {IncomingMessage} from 'http'
import {requireUser} from './requireUser'
/**
 *
 */
export const requireUserAdmin = async (req: IncomingMessage) => {
  const [user, session] = await requireUser(req)
  if (!user.admin) throw new Error(`Failed because user is not an admin.`)
  return [user, session] as const
}
