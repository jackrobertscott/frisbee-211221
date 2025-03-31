import {
  SeasonCreateDef,
  SeasonListDef,
  SeasonUpdateDef,
} from '@shared/endpoints/SeasonDef'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $SeasonList = createEndpoint(SeasonListDef)
/**
 *
 */
export const $SeasonCreate = createEndpoint(SeasonCreateDef)
/**
 *
 */
export const $SeasonUpdate = createEndpoint(SeasonUpdateDef)
