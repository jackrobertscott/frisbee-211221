import {TUserSafe} from '@shared/schemas/ioUser'

/**
 *
 */
export const userEmails = {
  /**
   *
   */
  primary(user: TUserSafe) {
    if (user.emails?.length) {
      const {value} = user.emails.find((i) => i.primary) ?? user.emails[0]
      return value
    }
    return user.email ? user.email : undefined
  },
}
