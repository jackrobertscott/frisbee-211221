import {ioSeason} from '@shared/schemas/ioSeason'
import {seasonNameCollation} from '@shared/utils/seasonName'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $Season = db.table({
  key: 'season',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {name: 1}, collation: seasonNameCollation},
    {key: {createdOn: -1}},
  ],
  schema: ioSeason,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
