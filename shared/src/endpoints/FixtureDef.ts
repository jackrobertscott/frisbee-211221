import {authPoint} from '@shared/auth/authAccess'
import {ioFixture, ioFixtureGame} from '@shared/schemas/ioFixture'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const FixtureCreateDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureCreate',
  payload: ioFixture.pick(['seasonId', 'title', 'date', 'games', 'grading']),
  result: ioFixture,
} satisfies TEndpointDef

export const FixtureUpdateDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureUpdate',
  payload: ioFixture
    .pick(['title', 'date', 'games', 'grading'])
    .extend({fixtureId: ioFixture.shape.id}),
  result: ioFixture,
} satisfies TEndpointDef

export const FixtureDeleteDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureDelete',
  payload: io.object({
    fixtureId: ioFixture.shape.id,
  }),
} satisfies TEndpointDef

export const FixtureSnapshotDef = {
  path: '/FixtureSnapshot',
  payload: io.object({
    fixtureId: ioFixture.shape.id,
  }),
} satisfies TEndpointDef

export const FixtureAdjustMultipleDef = {
  access: authPoint.fixtureManage,
  path: '/FixtureAdjustMultiple',
  payload: io.object({
    seasonId: ioFixture.shape.seasonId,
    referenceFixtureId: ioFixture.shape.id,
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
    seasonId: ioFixture.shape.seasonId,
    startingDate: ioFixture.shape.date,
    roundCount: io.number(),
    slots: io.array(
      io.object({
        id: ioFixtureGame.shape.id,
        time: ioFixtureGame.shape.time,
        place: ioFixtureGame.shape.place,
      }),
    ),
  }),
} satisfies TEndpointDef
