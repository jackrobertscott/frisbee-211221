import {ioSession} from '@shared/schemas/ioSession'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Session = db.table({
  key: 'session',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {userId: 1}},
    {key: {expiresOn: 1}},
  ],
  schema: ioSession,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
