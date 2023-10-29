import {ioSession} from '../schemas/ioSession'
import {db} from '../utils/db'
import {random} from '../utils/random'
/**
 *
 */
export const $Session = db.table({
  key: 'session',
  index: ['id'],
  schema: ioSession,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
