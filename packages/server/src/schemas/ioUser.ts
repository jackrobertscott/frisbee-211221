import {io, TioValue} from 'torva'
/**
 *
 */
export const ioUserEmail = io.object({
  value: io.string(),
  verified: io.boolean(),
  code: io.string(),
  createdOn: io.date(),
  primary: io.boolean(),
})
/**
 *
 */
export type TUserEmail = TioValue<typeof ioUserEmail>
/**
 *
 */
export const ioUser = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userMergedIds: io.optional(io.array(io.string())),
  admin: io.optional(io.boolean()),
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
/**
 *
 */
export type TUser = TioValue<typeof ioUser>
/**
 *
 */
export const ioUserPublic = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  firstName: io.string(),
  lastName: io.string(),
  gender: io.string(),
  avatarUrl: io.optional(io.string().trim()),
})
/**
 *
 */
export type TUserPublic = TioValue<typeof ioUserPublic>
