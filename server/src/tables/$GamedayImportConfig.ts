import {ioGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $GamedayImportConfig = db.table({
  key: 'gamedayImportConfig',
  indexes: [
    {key: {id: 1}, unique: true},
    {key: {seasonId: 1}, unique: true},
    {key: {scheduleEnabled: 1, updatedOn: 1}},
    {key: {scheduleLockedUntil: 1}},
  ],
  schema: ioGamedayImportConfig,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
    scheduleEnabled: () => false,
  },
})
