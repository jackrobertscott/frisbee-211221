import {ioReport} from '../../../shared/src/schemas/ioReport'
import {db} from '../utils/db'
import {random} from '../utils/random'
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
