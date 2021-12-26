import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioRound} from '../schemas/Round'
/**
 *
 */
export const $Round = db.table({
  key: 'round',
  index: ['id'],
  schema: ioRound,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
