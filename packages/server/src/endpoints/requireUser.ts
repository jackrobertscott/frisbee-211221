import {IncomingMessage} from 'http'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import gatekeeper from '../utils/gatekeeper'
/**
 *
 */
export const requireUser = async (req: IncomingMessage) => {
  const auth = await gatekeeper.digestRequest(req)
  const session = await $Session.getOne({id: auth.sessionId})
  if (session.ended) throw new Error('Your current session has ended.')
  const user = await $User.maybeOne({id: auth.userId})
  if (!user) throw new Error(`Failed to get user with id "${auth.userId}".`)
  return [user, session] as const
}
