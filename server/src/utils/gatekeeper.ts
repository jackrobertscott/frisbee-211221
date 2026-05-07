import {TUser} from '@shared/schemas/ioUser'
import {IncomingMessage} from 'http'
import {timingSafeEqual} from 'crypto'
import {io} from '@shared/torva'
import {$Session} from '../tables/$Session'
import config from '../config'
import jwt from './jwt'
import {random} from './random'

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
  async createUserSession(user: TUser, userAgent?: string) {
    const createdOn = new Date().toISOString()
    const expiresOn = new Date(
      Date.now() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    const sessionId = random.generateId()
    return $Session.createOne({
      id: sessionId,
      createdOn,
      expiresOn,
      userId: user.id,
      userAgent,
      token: jwt.encode(
        {
          sessionId,
          userId: user.id,
          createdOn,
        },
        {expiresIn: `${config.SESSION_TTL_DAYS}d`},
      ),
    })
  },

  tokenFromRequest(req: IncomingMessage) {
    return normalizeToken(req.headers.authorization)
  },

  isTokenEqual(first?: string, second?: string) {
    return compareToken(first, second)
  },

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
      expiresOn?: string
      ended?: boolean
    },
  ) {
    const now = Date.now()
    const expiresOn = session?.expiresOn
      ? new Date(session.expiresOn).valueOf()
      : 0
    return Boolean(
      auth &&
        session &&
        !session.ended &&
        expiresOn > now &&
        session.userId === auth.userId &&
        this.isTokenEqual(session.token, auth.token),
    )
  },

  async digestRequest(req: IncomingMessage) {
    const token = this.tokenFromRequest(req)
    if (!token) return undefined
    const data: any = jwt.decode(token)
    const done = ioJWT.validate(data)
    if (!done.ok) throw done.error
    return {...done.value, token}
  },
}

const ioJWT = io.object({
  sessionId: io.id(),
  userId: io.id(),
  createdOn: io.date(),
})
