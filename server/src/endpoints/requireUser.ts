import {IncomingMessage} from 'http'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import gatekeeper from '../utils/gatekeeper'
/**
 *
 */
export const requireUser = async (req: IncomingMessage) => {
  const auth = await gatekeeper.digestRequest(req)
  if (!auth) throw new Error('Auth token not present on request.')
  const [user, session] = await Promise.all([
    $User.getOne({id: auth.userId}),
    $Session.getOne({id: auth.sessionId}),
  ])
  if (session.ended) throw new Error('Your current session has ended.')
  return [user, session] as const
}
