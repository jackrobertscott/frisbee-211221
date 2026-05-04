import {ioAuthAttemptLimit} from '@shared/schemas/ioAuthAttemptLimit'
import {db} from '../utils/db'

export const $AuthAttemptLimit = db.table({
  key: 'authAttemptLimit',
  index: ['id'],
  schema: ioAuthAttemptLimit,
  defaults: {
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
