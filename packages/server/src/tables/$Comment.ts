import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioComment} from '../schemas/ioComment'
/**
 *
 */
export const $Comment = db.table({
  key: 'comment',
  index: ['id'],
  schema: ioComment,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
