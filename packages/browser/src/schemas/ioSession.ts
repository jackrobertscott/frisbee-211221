import {io, TypeIoValue} from 'torva'
/**
 *
 */
export const ioSession = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  token: io.string(),
  userId: io.string(),
  ended: io.optional(io.boolean()),
  endedOn: io.optional(io.date()),
  userAgent: io.optional(io.string()),
})
/**
 *
 */
export type TSession = TypeIoValue<typeof ioSession>
