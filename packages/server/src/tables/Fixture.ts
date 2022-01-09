import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioRound} from '../schemas/Fixture'
/**
 *
 */
export const $Fixture = db.table({
  key: 'fixture',
  index: ['id'],
  schema: ioRound,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
