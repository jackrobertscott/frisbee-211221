import {io, TypeIoValue} from 'torva'

export const ioUserEmail = io.object({
  value: io.string(),
  verified: io.boolean(),
  code: io.string(),
  createdOn: io.date(),
  primary: io.boolean(),
})

export type TUserEmail = TypeIoValue<typeof ioUserEmail>

export const ioUserEmailSafe = io.object({
  value: io.string(),
  verified: io.boolean(),
  createdOn: io.date(),
  primary: io.boolean(),
})

export type TUserEmailSafe = TypeIoValue<typeof ioUserEmailSafe>

export const ioUser = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userMergedIds: io.optional(io.array(io.string())),
  admin: io.optional(io.boolean()),
  isMock: io.optional(io.boolean()), // for testing purposes
  firstName: io.string(),
  lastName: io.string(),
  gender: io.string(),
  password: io.optional(io.string()),
  email: io.null(io.optional(io.string())), // depreciated
  emails: io.optional(io.array(ioUserEmail)),
  avatarUrl: io.optional(io.string().trim()),
  bio: io.optional(io.string().trim()),
  termsAccepted: io.boolean(),
  lastSeasonId: io.optional(io.string()),
})

export type TUser = TypeIoValue<typeof ioUser>

export const ioUserSafe = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userMergedIds: io.optional(io.array(io.string())),
  admin: io.optional(io.boolean()),
  isMock: io.optional(io.boolean()),
  firstName: io.string(),
  lastName: io.string(),
  gender: io.string(),
  email: io.null(io.optional(io.string())),
  emails: io.optional(io.array(ioUserEmailSafe)),
  avatarUrl: io.optional(io.string().trim()),
  bio: io.optional(io.string().trim()),
  termsAccepted: io.boolean(),
  lastSeasonId: io.optional(io.string()),
})

export type TUserSafe = TypeIoValue<typeof ioUserSafe>

export const ioUserPublic = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  firstName: io.string(),
  lastName: io.string(),
  gender: io.string(),
  avatarUrl: io.optional(io.string().trim()),
})

export type TUserPublic = TypeIoValue<typeof ioUserPublic>
