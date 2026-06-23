import {ioGamedayImportRun} from '@shared/schemas/ioGamedayImport'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $GamedayImportRun = db.table({
  key: 'gamedayImportRun',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {seasonId: 1, startedOn: -1}},
    {key: {configId: 1, startedOn: -1}},
    {key: {status: 1, startedOn: -1}},
  ],
  schema: ioGamedayImportRun,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
