import {createHmac, timingSafeEqual} from 'crypto'
import bcrypt from 'bcryptjs'
import config from '../config'
import {random} from './random'

export default {

  encrypt: async (password: string): Promise<string> => {
    return bcrypt
      .genSalt(11)
      .then((salt: string) => bcrypt.hash(password, salt))
  },

  compare: async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash)
  },

  digest(value: string) {
    return createHmac('sha256', config.jwtSecret).update(value).digest('hex')
  },

  equals(value: string, expected: string) {
    const left = Buffer.from(this.digest(value), 'utf8')
    const right = Buffer.from(expected, 'utf8')
    return left.length === right.length && timingSafeEqual(left, right)
  },

  randomString(length?: number) {
    return random.randomString(length)
  },
}
