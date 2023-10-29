import {ioTeam} from '../../../shared/src/schemas/ioTeam'
import {db} from '../utils/db'
import {random} from '../utils/random'
/**
 *
 */
export const $Team = db.table({
  key: 'team',
  index: ['id'],
  schema: ioTeam,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
