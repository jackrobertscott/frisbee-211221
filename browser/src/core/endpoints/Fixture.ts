import {
  FixtureAdjustMultipleDef,
  FixtureCreateDef,
  FixtureDeleteDef,
  FixtureGenerateDef,
  FixtureUpdateDef,
} from '@shared/endpoints/FixtureDef'
import {createEndpoint} from './createEndpoint'

export const $FixtureCreate = createEndpoint(FixtureCreateDef)

export const $FixtureUpdate = createEndpoint(FixtureUpdateDef)

export const $FixtureDelete = createEndpoint(FixtureDeleteDef)


export const $FixtureAdjustMultiple = createEndpoint(FixtureAdjustMultipleDef)

export const $FixtureGenerate = createEndpoint(FixtureGenerateDef)
