import {TUserSafe} from '@shared/schemas/ioUser'

export const userEmails = {

  primary(user: TUserSafe) {
    const {value} = user.emails.find((i) => i.primary) ?? user.emails[0]
    return value
  },
}
