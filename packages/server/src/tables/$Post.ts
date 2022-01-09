import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioPost} from '../schemas/ioPost'
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
