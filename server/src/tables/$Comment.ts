import {ioComment} from '@shared/schemas/ioComment'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Comment = db.table({
  key: 'comment',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {postId: 1, createdOn: -1}},
    {key: {userId: 1}},
  ],
  schema: ioComment,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
