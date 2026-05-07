import {io, TypeIoValue} from '@shared/torva'

export const ioSession = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  expiresOn: io.date(),
  token: io.string(),
  userId: io.id(),
  ended: io.optional(io.boolean()),
  endedOn: io.optional(io.date()),
  userAgent: io.optional(io.string()),
})

export type TSession = TypeIoValue<typeof ioSession>
