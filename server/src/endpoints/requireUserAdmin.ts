import {forbiddenError} from '@shared/errors'
import {IncomingMessage} from 'http'
import {requireUser} from './requireUser'

export const requireUserAdmin = async (req: IncomingMessage) => {
  const [user, session] = await requireUser(req)
  if (!user.admin) {
    throw forbiddenError(`Failed because user is not an admin.`, {
      errorCode: 'auth.admin_required',
    })
  }
  return [user, session] as const
}
