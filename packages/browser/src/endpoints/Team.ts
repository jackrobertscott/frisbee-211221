import {TeamCreateDef, TeamCurrentCreateDef, TeamCurrentUpdateDef, TeamDeleteDef, TeamListOfSeasonDef, TeamUpdateDef} from '@shared/endpoints/TeamDef'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $TeamListOfSeason = createEndpoint(TeamListOfSeasonDef)
/**
 *
 */
export const $TeamCurrentCreate = createEndpoint(TeamCurrentCreateDef)
/**
 *
 */
export const $TeamCurrentUpdate = createEndpoint(TeamCurrentUpdateDef)
/**
 *
 */
export const $TeamCreate = createEndpoint(TeamCreateDef)
/**
 *
 */
export const $TeamUpdate = createEndpoint(TeamUpdateDef)
/**
 *
 */
export const $TeamDelete = createEndpoint(TeamDeleteDef)