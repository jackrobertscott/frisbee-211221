import {io, TypeIoValue} from '@shared/torva'

export const ioAuthAttemptLimit = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  kind: io.enum(['login', 'verify', 'delivery']),
  scope: io.enum(['account', 'client']),
  email: io.string(),
  ip: io.optional(io.string()),
  attempts: io.number(),
  windowStartedAt: io.number(),
  blockedUntil: io.number(),
  lastSeenAt: io.number(),
})

export type TAuthAttemptLimit = TypeIoValue<typeof ioAuthAttemptLimit>
