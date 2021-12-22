import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioUser} from '../schemas/User'
/**
 *
 */
export const $User = db.table({
  key: 'user',
  index: ['id'],
  schema: ioUser,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
