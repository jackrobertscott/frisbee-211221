import {io, TypeIoValue} from '@shared/torva'
import {ioUserGender} from './ioUserGender'

export const ioUserEmail = io.object({
  value: io.string().email().trim(),
  verified: io.boolean(),
  code: io.string(),
  createdOn: io.date(),
  primary: io.boolean(),
})

export type TUserEmail = TypeIoValue<typeof ioUserEmail>

export const ioUserEmailSafe = ioUserEmail.pick([
  'value',
  'verified',
  'createdOn',
  'primary',
])

export type TUserEmailSafe = TypeIoValue<typeof ioUserEmailSafe>

export const ioUser = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userMergedIds: io.optional(io.array(io.id())),
  admin: io.optional(io.boolean()),
  isMock: io.optional(io.boolean()), // for testing purposes
  firstName: io.string(),
  lastName: io.string(),
  gender: ioUserGender,
  password: io.optional(io.string()),
  emails: io.array(ioUserEmail), // this array may be empty for some old users that were imported without an email
  avatarUrl: io.optional(io.string().trim()),
  bio: io.optional(io.string().trim()),
  termsAccepted: io.boolean(),
  lastSeasonId: io.optional(io.id()),
})

export type TUser = TypeIoValue<typeof ioUser>

export const ioUserSafe = ioUser.omit(['password', 'emails']).extend({
  emails: io.array(ioUserEmailSafe),
})

export type TUserSafe = TypeIoValue<typeof ioUserSafe>

export const ioUserPublic = ioUser.pick([
  'id',
  'createdOn',
  'updatedOn',
  'firstName',
  'lastName',
  'gender',
  'avatarUrl',
])

export type TUserPublic = TypeIoValue<typeof ioUserPublic>
