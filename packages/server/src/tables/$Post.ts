import {ioPost} from '../schemas/ioPost'
import {db} from '../utils/db'
import {random} from '../utils/random'
/**
 *
 */
export const $Post = db.table({
  key: 'post',
  index: ['id'],
  schema: ioPost,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
