import {ioAuthAttemptLimit} from '@shared/schemas/ioAuthAttemptLimit'
import {db} from '../utils/db'

export const $AuthAttemptLimit = db.table({
  key: 'authAttemptLimit',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {blockedUntil: 1, lastSeenAt: 1}},
    {key: {lastSeenAt: 1}, expireAfterSeconds: 1800},
  ],
  schema: ioAuthAttemptLimit,
  defaults: {
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
