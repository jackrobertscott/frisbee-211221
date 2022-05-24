import {IncomingMessage} from 'http'
import {io} from 'torva'
import {TUser} from '../schemas/ioUser'
import {$Session} from '../tables/$Session'
import jwt from './jwt'
import {random} from './random'
/**
 *
 */
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
  async digestRequest(req: IncomingMessage) {
    const header = req.headers.authorization
    if (!header || header === 'undefined') return undefined
    const data: any = jwt.decode(header)
    const done = ioJWT.validate(data)
    if (!done.ok) throw done.error
    return done.value
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
