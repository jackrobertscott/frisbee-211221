import {ioSeason} from '../schemas/ioSeason'
import {db} from '../utils/db'
import {random} from '../utils/random'
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
