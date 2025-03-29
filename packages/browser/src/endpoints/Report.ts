import {ReportCreateDef, ReportDeleteDef, ReportGetFixtureAgainstDef, ReportListOfFixtureDef, ReportListOfSeasonDef, ReportMissingListDef, ReportUpdateDef} from '@shared/endpoints/ReportDef'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $ReportListOfFixture = createEndpoint(ReportListOfFixtureDef)
/**
 *
 */
export const $ReportListOfSeason = createEndpoint(ReportListOfSeasonDef)
/**
 *
 */
export const $ReportGetFixtureAgainst = createEndpoint(ReportGetFixtureAgainstDef)
/**
 *
 */
export const $ReportCreate = createEndpoint(ReportCreateDef)
/**
 *
 */
export const $ReportUpdate = createEndpoint(ReportUpdateDef)
/**
 *
 */
export const $ReportDelete = createEndpoint(ReportDeleteDef)
/**
 *
 */
export const $ReportMissingList = createEndpoint(ReportMissingListDef)