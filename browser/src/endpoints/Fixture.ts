import {FixtureAdjustMultipleDef, FixtureCreateDef, FixtureDeleteDef, FixtureGenerateDef, FixtureGetDef, FixtureListOfSeasonDef, FixtureSnapshotDef, FixtureUpdateDef} from '@shared/endpoints/FixtureDef'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $FixtureListOfSeason = createEndpoint(FixtureListOfSeasonDef)
/**
 *
 */
export const $FixtureGet = createEndpoint(FixtureGetDef)
/**
 *
 */
export const $FixtureCreate = createEndpoint(FixtureCreateDef)
/**
 *
 */
export const $FixtureUpdate = createEndpoint(FixtureUpdateDef)
/**
 *
 */
export const $FixtureDelete = createEndpoint(FixtureDeleteDef)
/**
 *
 */
export const $FixtureSnapshot = createEndpoint(FixtureSnapshotDef)
/**
 *
 */
export const $FixtureAdjustMultiple = createEndpoint(FixtureAdjustMultipleDef)
/**
 *
 */
export const $FixtureGenerate = createEndpoint(FixtureGenerateDef)