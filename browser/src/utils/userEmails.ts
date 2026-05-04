import {TUserSafe} from '@shared/schemas/ioUser'

export const userEmails = {

  primary(user: TUserSafe) {
    return user.emails.find((i) => i.primary)?.value ?? user.emails[0]?.value
  },
}
