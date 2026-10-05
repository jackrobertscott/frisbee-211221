import {unauthorizedError} from '@shared/errors'
import {IncomingMessage} from 'http'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import gatekeeper from './sessions'

export const requireUser = async (req: IncomingMessage) => {
  const auth = await gatekeeper.digestRequest(req)
  if (!auth) {
    if (gatekeeper.tokenFromRequest(req))
      throw unauthorizedError('Auth token is not valid.', {
        errorCode: 'auth.token_invalid',
      })
    throw unauthorizedError('Auth token not present on request.', {
      errorCode: 'auth.token_missing',
    })
  }
  const [user, session] = await Promise.all([
    $User.maybeOne({id: auth.userId}),
    $Session.maybeOne({id: auth.sessionId}),
  ])
  if (!user || !session || !gatekeeper.isSessionValid(auth, session)) {
    throw unauthorizedError('Auth token is not valid.', {
      errorCode: 'auth.token_invalid',
    })
  }
  return [user, session] as const
}
