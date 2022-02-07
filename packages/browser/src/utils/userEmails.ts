import {TUser} from '../schemas/ioUser'

/**
 *
 */
export const userEmails = {
  /**
   *
   */
  primary(user: TUser) {
    if (user.emails?.length) {
      const {value} = user.emails.find((i) => i.primary) ?? user.emails[0]
      return value
    }
    return user.email ? user.email : undefined
  },
}
