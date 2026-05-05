import {authPoint} from '@shared/auth/authAccess'
import {ioFixture, ioFixtureGame} from '@shared/schemas/ioFixture'
import {ioTeam} from '@shared/schemas/ioTeam'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const FixtureListOfSeasonDef = {
  path: '/FixtureListOfSeason',
  payload: io.object({
    seasonId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioFixture),
} satisfies TEndpointDef

export const FixtureGetDef = {
  path: '/FixtureGet',
  payload: io.object({
    fixtureId: io.string(),
  }),
  result: io.object({
    fixture: ioFixture,
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const FixtureCreateDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureCreate',
  payload: io.object({
    seasonId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioFixtureGame),
    grading: io.optional(io.boolean()),
  }),
  result: ioFixture,
} satisfies TEndpointDef

export const FixtureUpdateDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureUpdate',
  payload: io.object({
    fixtureId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioFixtureGame),
    grading: io.optional(io.boolean()),
  }),
  result: ioFixture,
} satisfies TEndpointDef

export const FixtureDeleteDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureDelete',
  payload: io.object({
    fixtureId: io.string(),
  }),
} satisfies TEndpointDef

export const FixtureSnapshotDef = {
  path: '/FixtureSnapshot',
  payload: io.object({
    fixtureId: io.string(),
  }),
} satisfies TEndpointDef

export const FixtureAdjustMultipleDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureAdjustMultiple',
  payload: io.object({
    seasonId: io.string(),
    referenceFixtureId: io.string(),
    amount: io.number(),
    unit: io.string(),
    direction: io.string(),
  }),
  result: io.object({
    count: io.number(),
  }),
} satisfies TEndpointDef

export const FixtureGenerateDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureGenerate',
  payload: io.object({
    seasonId: io.string(),
    startingDate: io.date(),
    roundCount: io.number(),
    slots: io.array(
      io.object({
        id: io.string(),
        time: io.string(),
        place: io.string(),
      })
    ),
  }),
} satisfies TEndpointDef
