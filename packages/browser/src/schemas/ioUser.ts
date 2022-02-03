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
  admin: io.optional(io.boolean()),
  firstName: io.string(),
  lastName: io.string(),
  gender: io.string(),
  password: io.optional(io.string()),
  email: io.string(), // depreciated
  emailVerified: io.boolean(), // depreciated
  emailCode: io.string(), // depreciated
  emailCodeCreatedOn: io.string(), // depreciated
  emails: io.optional(io.array(ioUserEmail)),
  avatarUrl: io.optional(io.string().trim()),
  bio: io.optional(io.string().trim()),
  termsAccepted: io.boolean(),
  lastMemberId: io.optional(io.string()),
})
/**
 *
 */
export type TUser = TioValue<typeof ioUser>
