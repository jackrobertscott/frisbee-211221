import {io, TioValue} from 'torva'
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
  password: io.string(),
  email: io.string(),
  emailVerified: io.boolean(),
  emailCode: io.string(),
  emailCodeCreatedOn: io.string(),
  avatarUrl: io.optional(io.string().trim()),
  bio: io.optional(io.string().trim()),
  termsAccepted: io.boolean(),
  businessMode: io.optional(io.boolean()),
  lastMemberId: io.optional(io.string()),
  paidFee: io.optional(io.boolean()),
})
/**
 *
 */
export type TUser = TioValue<typeof ioUser>
