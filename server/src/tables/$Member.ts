import {ioMember} from '@shared/schemas/ioMember'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Member = db.table({
  key: 'member',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {userId: 1, seasonId: 1}},
    {key: {teamId: 1, userId: 1}},
    {key: {teamId: 1, pending: 1}},
    {key: {userId: 1, pending: 1}},
  ],
  schema: ioMember,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
