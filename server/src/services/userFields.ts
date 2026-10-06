import {TUser, TUserPublic, TUserSafe} from '@shared/schemas/ioUser'

/** The profile fields any signed-in user may see about another user. */
export const selectPublicUserFields = (user: TUser): TUserPublic => ({
  id: user.id,
  createdOn: user.createdOn,
  updatedOn: user.updatedOn,
  firstName: user.firstName,
  lastName: user.lastName,
  genderMatching: user.genderMatching,
  avatarUrl: user.avatarUrl,
})

/** The full user record without the password or email verification codes. */
export const selectSafeUserFields = (user: TUser): TUserSafe => {
  const {password: _password, emails, ...safe} = user
  return {
    ...safe,
    emails: emails.map(({code: _code, ...email}) => email),
  }
}
