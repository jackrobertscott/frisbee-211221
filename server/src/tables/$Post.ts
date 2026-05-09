import {ioPost} from '@shared/schemas/ioPost'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Post = db.table({
  key: 'post',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {createdOn: -1}},
    {key: {userId: 1}},
  ],
  schema: ioPost,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
