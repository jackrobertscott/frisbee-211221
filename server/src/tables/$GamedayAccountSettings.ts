import {ioGamedayAccountSettings} from '@shared/schemas/ioGamedayAccountSettings'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const $GamedayAccountSettings = db.table({
  key: 'gamedayAccountSettings',
  index: ['id', 'seasonId'],
  schema: ioGamedayAccountSettings,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
