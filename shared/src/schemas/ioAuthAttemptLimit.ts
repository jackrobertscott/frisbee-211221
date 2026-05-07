import {io, TypeIoValue} from '@shared/torva'

export const ioAuthAttemptLimit = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  kind: io.enum(['login', 'verify', 'delivery']),
  scope: io.enum(['account', 'client']),
  email: io.string().email().trim(),
  ip: io.optional(io.string().trim()),
  attempts: io.number().integer().min(0),
  windowStartedAt: io.timestamp(),
  blockedUntil: io.timestamp(),
  lastSeenAt: io.timestamp(),
})

export type TAuthAttemptLimit = TypeIoValue<typeof ioAuthAttemptLimit>
