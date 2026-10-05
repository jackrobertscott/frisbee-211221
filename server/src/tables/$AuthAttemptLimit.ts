import {ioAuthAttemptLimit} from '@shared/schemas/ioAuthAttemptLimit'
import {db} from '../db/table'

export const $AuthAttemptLimit = db.table({
  key: 'authAttemptLimit',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {blockedUntil: 1, lastSeenAt: 1}},
  ],
  schema: ioAuthAttemptLimit,
  defaults: {
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
