import {TUser} from '@shared/schemas/ioUser'
import {IncomingMessage} from 'http'
import {timingSafeEqual} from 'crypto'
import {io} from 'torva'
import {$Session} from '../tables/$Session'
import jwt from './jwt'
import {random} from './random'
/**
 *
 */
const normalizeToken = (value?: string | string[]) => {
  const header = Array.isArray(value) ? value[0] : value
  if (!header || header === 'undefined') return undefined
  const token = header.replace(/^Bearer\s+/i, '').trim()
  return token || undefined
}

const compareToken = (first?: string, second?: string) => {
  if (!first || !second) return false
  const a = Buffer.from(first, 'utf8')
  const b = Buffer.from(second, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export default {
  /**
   *
   */
  async createUserSession(user: TUser, userAgent?: string) {
    const createdOn = new Date().toISOString()
    const sessionId = random.generateId()
    return $Session.createOne({
      id: sessionId,
      createdOn,
      userId: user.id,
      userAgent,
      token: jwt.encode({
        sessionId,
        userId: user.id,
        createdOn,
      }),
    })
  },
  /**
   *
   */
  tokenFromRequest(req: IncomingMessage) {
    return normalizeToken(req.headers.authorization)
  },
  /**
   *
   */
  isTokenEqual(first?: string, second?: string) {
    return compareToken(first, second)
  },
  /**
   *
   */
  isSessionValid(
    auth:
      | {
          token: string
          sessionId: string
          userId: string
        }
      | undefined,
    session?: {
      token?: string
      userId?: string
      ended?: boolean
    }
  ) {
    return Boolean(
      auth &&
        session &&
        !session.ended &&
        session.userId === auth.userId &&
        this.isTokenEqual(session.token, auth.token)
    )
  },
  /**
   *
   */
  async digestRequest(req: IncomingMessage) {
    const token = this.tokenFromRequest(req)
    if (!token) return undefined
    const data: any = jwt.decode(token)
    const done = ioJWT.validate(data)
    if (!done.ok) throw done.error
    return {...done.value, token}
  },
}
/**
 *
 */
const ioJWT = io.object({
  sessionId: io.string(),
  userId: io.string(),
  createdOn: io.date(),
})
