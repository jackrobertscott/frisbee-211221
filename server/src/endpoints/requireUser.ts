import {unauthorizedError} from '@shared/errors'
import {IncomingMessage} from 'http'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import gatekeeper from '../utils/gatekeeper'

export const requireUser = async (req: IncomingMessage) => {
  const auth = await gatekeeper.digestRequest(req)
  if (!auth) {
    throw unauthorizedError('Auth token not present on request.', {
      errorCode: 'auth.token_missing',
    })
  }
  const [user, session] = await Promise.all([
    $User.getOne({id: auth.userId}),
    $Session.getOne({id: auth.sessionId}),
  ])
  if (!gatekeeper.isSessionValid(auth, session)) {
    throw unauthorizedError('Auth token is not valid.', {
      errorCode: 'auth.token_invalid',
    })
  }
  return [user, session] as const
}
