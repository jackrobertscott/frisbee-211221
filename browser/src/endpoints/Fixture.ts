import {FixtureAdjustMultipleDef, FixtureCreateDef, FixtureDeleteDef, FixtureGenerateDef, FixtureSnapshotDef, FixtureUpdateDef} from '@shared/endpoints/FixtureDef'
import {createEndpoint} from '../utils/endpoints'

export const $FixtureCreate = createEndpoint(FixtureCreateDef)

export const $FixtureUpdate = createEndpoint(FixtureUpdateDef)

export const $FixtureDelete = createEndpoint(FixtureDeleteDef)

export const $FixtureSnapshot = createEndpoint(FixtureSnapshotDef)

export const $FixtureAdjustMultiple = createEndpoint(FixtureAdjustMultipleDef)

export const $FixtureGenerate = createEndpoint(FixtureGenerateDef)
