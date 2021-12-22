import * as bcrypt from 'bcryptjs'
/**
 *
 */
export default {
  /**
   *
   */
  encrypt: async (password: string): Promise<string> => {
    return bcrypt
      .genSalt(11)
      .then((salt: string) => bcrypt.hash(password, salt))
  },
  /**
   *
   */
  compare: async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash)
  },
  /**
   *
   */
  randomString(length?: number) {
    let data = Math.random().toString().slice(2)
    if (length) data = data.slice(0, length)
    return data
  },
}
