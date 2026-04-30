import {IncomingMessage} from 'http'
import {StatusCodes} from 'http-status-codes'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import gatekeeper from '../utils/gatekeeper'

const createAuthError = (message: string, statusCode: number) => {
  const error: any = new Error(message)
  error.statusCode = statusCode
  return error
}

export const requireUser = async (req: IncomingMessage) => {
  const auth = await gatekeeper.digestRequest(req)
  if (!auth) {
    throw createAuthError(
      'Auth token not present on request.',
      StatusCodes.UNAUTHORIZED
    )
  }
  const [user, session] = await Promise.all([
    $User.getOne({id: auth.userId}),
    $Session.getOne({id: auth.sessionId}),
  ])
  if (!gatekeeper.isSessionValid(auth, session)) {
    throw createAuthError(
      'Auth token is not valid.',
      StatusCodes.UNAUTHORIZED
    )
  }
  return [user, session] as const
}
