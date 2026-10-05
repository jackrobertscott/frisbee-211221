import {badRequestError} from '@shared/errors'
import {createHmac, timingSafeEqual} from 'crypto'
import bcrypt from 'bcryptjs'
import config from '../config'
import {random} from '../utils/random'

export const PASSWORD_MIN_LENGTH = 5
// bcrypt ignores input past 72 bytes; cap length so huge inputs stay cheap
export const PASSWORD_MAX_LENGTH = 200

let dummyHash: Promise<string> | undefined

export default {
  assertNewPasswordValid(password: string) {
    if (password.length < PASSWORD_MIN_LENGTH)
      throw badRequestError(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
        {errorCode: 'user.password_too_short'},
      )
    if (password.length > PASSWORD_MAX_LENGTH)
      throw badRequestError(
        `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
        {errorCode: 'user.password_too_long'},
      )
  },

  encrypt: async (password: string): Promise<string> => {
    return bcrypt
      .genSalt(11)
      .then((salt: string) => bcrypt.hash(password, salt))
  },

  compare: async (password: string, hash: string): Promise<boolean> => {
    if (password.length > PASSWORD_MAX_LENGTH) return false
    return bcrypt.compare(password, hash)
  },

  /** Spend the same time as a real compare so missing accounts are not revealed. */
  async compareDummy(password: string) {
    dummyHash ??= bcrypt.hash(random.randomString(24), 11)
    await bcrypt.compare(password.slice(0, PASSWORD_MAX_LENGTH), await dummyHash)
    return false
  },

  digest(value: string) {
    return createHmac('sha256', config.JWT_SECRET).update(value).digest('hex')
  },

  equals(value: string, expected: string) {
    const left = Buffer.from(this.digest(value), 'utf8')
    const right = Buffer.from(expected, 'utf8')
    return left.length === right.length && timingSafeEqual(left, right)
  },
}
