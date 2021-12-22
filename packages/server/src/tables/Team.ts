import {db} from '../utils/db'
import {random} from '../utils/random'
import {ioTeam} from '../schemas/Team'
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
