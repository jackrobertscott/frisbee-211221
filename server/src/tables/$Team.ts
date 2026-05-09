import {ioTeam} from '@shared/schemas/ioTeam'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Team = db.table({
  key: 'team',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {seasonId: 1, division: 1, name: 1}},
    {key: {seasonId: 1, name: 1}},
    {key: {seasonId: 1, phone: 1, name: 1}},
    {key: {seasonId: 1, email: 1, name: 1}},
    {key: {seasonId: 1, createdOn: -1}},
    {key: {createdOn: 1}},
    {key: {isMock: 1}},
  ],
  schema: ioTeam,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
