import * as jwt from 'jsonwebtoken'
import config from '../config'
/**
 *
 */
export default {
  /**
   *
   */
  encode: <T extends string | object>(
    data: T,
    options?: jwt.SignOptions
  ): string => {
    return jwt.sign(data, config.jwtSecret, options)
  },
  /**
   *
   */
  decode: <T extends string | object>(token: string): T => {
    return jwt.verify(token, config.jwtSecret) as T
  },
}
