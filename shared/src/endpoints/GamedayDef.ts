import {ioGamedayAccountSettings} from '@shared/schemas/ioGamedayAccountSettings'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

const ioGamedayConnectionShape = {
  name: io.string().trim(),
  organisationId: io.string().trim(),
  tokenUrl: io.string().trim(),
  apiBaseUrl: io.string().trim(),
  clientId: io.string().trim(),
  clientSecret: io.string().trim(),
  grantType: io.string().trim(),
  scope: io.optional(io.string().trim().emptyok()),
}

const ioGamedayConnectionFields = io.object({
  ...ioGamedayConnectionShape,
})

export const GamedayAccountSettingsListOfSeasonDef = {
  path: '/GamedayAccountSettingsListOfSeason',
  payload: io.object({
    seasonId: io.string().trim(),
  }),
  result: io.array(ioGamedayAccountSettings),
} satisfies TEndpointDef

export const GamedayAccountSettingsConnectDef = {
  path: '/GamedayAccountSettingsConnect',
  payload: ioGamedayConnectionFields,
  result: io.object({
    connectedOn: io.date(),
  }),
} satisfies TEndpointDef

export const GamedayAccountSettingsCreateDef = {
  path: '/GamedayAccountSettingsCreate',
  payload: io.object({
    seasonId: io.string().trim(),
    ...ioGamedayConnectionShape,
  }),
  result: ioGamedayAccountSettings,
} satisfies TEndpointDef

export const GamedayAccountSettingsUpdateDef = {
  path: '/GamedayAccountSettingsUpdate',
  payload: io.object({
    gamedayAccountSettingsId: io.string().trim(),
    ...ioGamedayConnectionShape,
  }),
  result: ioGamedayAccountSettings,
} satisfies TEndpointDef

export const GamedayAccountSettingsDeleteDef = {
  path: '/GamedayAccountSettingsDelete',
  payload: io.object({
    gamedayAccountSettingsId: io.string().trim(),
  }),
} satisfies TEndpointDef
