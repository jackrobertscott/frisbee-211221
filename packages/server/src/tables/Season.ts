import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioSeason} from '../schemas/Season'
/**
 *
 */
export const $Season = db.table({
  key: 'season',
  index: ['id'],
  schema: ioSeason,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
