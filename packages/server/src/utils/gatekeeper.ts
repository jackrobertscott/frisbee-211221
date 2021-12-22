import {IncomingMessage} from 'http'
import {io} from 'torva'
import {TUser} from '../schemas/User'
import {$Session} from '../tables/Session'
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
    if (!header || header === 'undefined')
      throw new Error('Auth token missing from request.')
    const data: any = jwt.decode(header)
    const done = ioJWT.validate(data)
    if (!done.ok) {
      console.log(done.error)
      throw new Error('Auth token is invalid.')
    }
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
