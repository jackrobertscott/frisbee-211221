import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioMember} from '../schemas/Member'
/**
 *
 */
export const $Member = db.table({
  key: 'member',
  index: ['id'],
  schema: ioMember,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
