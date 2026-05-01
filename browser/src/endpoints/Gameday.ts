import {
  GamedayAccountSettingsConnectDef,
  GamedayAccountSettingsCreateDef,
  GamedayAccountSettingsDeleteDef,
  GamedayAccountSettingsListOfSeasonDef,
  GamedayAccountSettingsUpdateDef,
} from '@shared/endpoints/GamedayDef'
import {createEndpoint} from '../utils/endpoints'

export const $GamedayAccountSettingsListOfSeason = createEndpoint(
  GamedayAccountSettingsListOfSeasonDef
)

export const $GamedayAccountSettingsConnect = createEndpoint(
  GamedayAccountSettingsConnectDef
)

export const $GamedayAccountSettingsCreate = createEndpoint(
  GamedayAccountSettingsCreateDef
)

export const $GamedayAccountSettingsUpdate = createEndpoint(
  GamedayAccountSettingsUpdateDef
)

export const $GamedayAccountSettingsDelete = createEndpoint(
  GamedayAccountSettingsDeleteDef
)
