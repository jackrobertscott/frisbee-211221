import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioReport} from '../schemas/ioReport'
/**
 *
 */
export const $Report = db.table({
  key: 'report',
  index: ['id'],
  schema: ioReport,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
