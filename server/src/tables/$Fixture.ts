import {ioFixture} from '@shared/schemas/ioFixture'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Fixture = db.table({
  key: 'fixture',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {seasonId: 1, date: 1}},
    {key: {userId: 1}},
    {key: {createdOn: 1}},
  ],
  schema: ioFixture,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
