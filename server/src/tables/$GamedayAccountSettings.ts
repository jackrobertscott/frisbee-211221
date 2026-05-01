import {io, TypeIoValue} from '@shared/torva'
import {db} from '../utils/db'
import {random} from '../utils/random'

export const ioGamedayAccountSettingsRecord = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.string(),
  name: io.string(),
  organisationId: io.string(),
  tokenUrl: io.string(),
  apiBaseUrl: io.string(),
  clientId: io.string(),
  encryptedOauthClientSecret: io.string(),
  grantType: io.string(),
  scope: io.optional(io.string().emptyok()),
  lastConnectedOn: io.optional(io.date()),
})

export type TGamedayAccountSettingsRecord = TypeIoValue<
  typeof ioGamedayAccountSettingsRecord
>

export const $GamedayAccountSettings = db.table({
  key: 'gamedayAccountSettings',
  index: ['id', 'seasonId'],
  schema: ioGamedayAccountSettingsRecord,
  defaults: {
    id: () => random.generateId(),
    createdOn: () => new Date().toISOString(),
    updatedOn: () => new Date().toISOString(),
  },
})
