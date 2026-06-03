import {
  SeasonCreateDef,
  SeasonDeleteDef,
  SeasonDeleteStatusDef,
  SeasonListDef,
  SeasonUpdateDef,
} from '@shared/endpoints/SeasonDef'
import {createEndpoint} from '../utils/endpoints'

export const $SeasonList = createEndpoint(SeasonListDef)

export const $SeasonCreate = createEndpoint(SeasonCreateDef)

export const $SeasonUpdate = createEndpoint(SeasonUpdateDef)

export const $SeasonDeleteStatus = createEndpoint(SeasonDeleteStatusDef)

export const $SeasonDelete = createEndpoint(SeasonDeleteDef)
