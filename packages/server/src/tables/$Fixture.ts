import {ioFixture} from '../schemas/ioFixture'
import {db} from '../utils/db'
import {random} from '../utils/random'
/**
 *
 */
export const $Fixture = db.table({
  key: 'fixture',
  index: ['id'],
  schema: ioFixture,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
