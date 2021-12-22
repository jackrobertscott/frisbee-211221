import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioSession} from '../schemas/Session'
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
