import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioRequest} from '../schemas/ioRequest'
/**
 *
 */
export const $Request = db.table({
  key: 'request',
  index: ['id'],
  schema: ioRequest,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
