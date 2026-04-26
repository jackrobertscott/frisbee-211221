import {TUser, TUserSafe} from '@shared/schemas/ioUser'

export const selectSafeUserFields = (user: TUser): TUserSafe => {
  const {password: _password, emails, ...safe} = user
  return {
    ...safe,
    emails: emails?.map(({code: _code, ...email}) => email),
  }
}
