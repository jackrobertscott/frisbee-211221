import {io, TypeIoValue} from 'torva'

export const ioGamedayAccountSettings = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.string(),
  name: io.string(),
  organisationId: io.string(),
  tokenUrl: io.string(),
  apiBaseUrl: io.string(),
  clientId: io.string(),
  clientSecret: io.string(),
  grantType: io.string(),
  scope: io.optional(io.string().emptyok()),
  lastConnectedOn: io.optional(io.date()),
})

export type TGamedayAccountSettings = TypeIoValue<
  typeof ioGamedayAccountSettings
>
