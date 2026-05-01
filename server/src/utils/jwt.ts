import jwt from 'jsonwebtoken'
import config from '../config'

export default {

  encode: <T extends string | object>(
    data: T,
    options?: jwt.SignOptions
  ): string => {
    return jwt.sign(data, config.JWT_SECRET, options)
  },

  decode: <T extends string | object>(token: string): T => {
    return jwt.verify(token, config.JWT_SECRET) as T
  },
}
