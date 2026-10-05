import {
  FixtureAdjustMultipleDef,
  FixtureCreateDef,
  FixtureDeleteDef,
  FixtureGenerateDef,
  FixtureUpdateDef,
} from '@shared/endpoints/FixtureDef'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../http/createEndpoint'
import {requireAccess} from '../auth/requireAccess'
import {
  assertTeamsCanBeScheduled,
  planFixtureRounds,
  shiftFixtureDate,
} from '../services/fixtureSchedule'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...FixtureCreateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      await $Season.getOne({id: body.seasonId})
      return $Fixture.createOne({
        ...body,
        games: body.games,
        userId: user.id,
      })
    },
  }),

  createEndpoint({
    ...FixtureUpdateDef,
    handler:
      ({fixtureId, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        return $Fixture.updateOne(
          {id: fixtureId},
          {...body, updatedOn: new Date().toISOString()},
        )
      },
  }),

  createEndpoint({
    ...FixtureDeleteDef,
    handler:
      ({fixtureId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Fixture.deleteOne({id: fixtureId})
      },
  }),

  createEndpoint({
    ...FixtureAdjustMultipleDef,
    handler:
      ({seasonId, referenceFixtureId, ...adjustment}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const referenceFixture = await $Fixture.getOne({id: referenceFixtureId})
        const fixtures = await $Fixture.getMany(
          {
            seasonId,
            date: {$gte: new Date(referenceFixture.date).toISOString()},
          },
          {sort: {date: 1}},
        )
        await Promise.all(
          fixtures.map((fixture) =>
            $Fixture.updateOne(
              {id: fixture.id},
              {
                date: shiftFixtureDate(fixture.date, adjustment),
                updatedOn: new Date().toISOString(),
              },
            ),
          ),
        )
        return {count: fixtures.length}
      },
  }),

  createEndpoint({
    ...FixtureGenerateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const season = await $Season.getOne({id: body.seasonId})
      const teams = await $Team.getMany({seasonId: season.id})
      assertTeamsCanBeScheduled(teams, body.slots.length)
      const existingFixtures = await $Fixture.getMany(
        {seasonId: season.id},
        {sort: {date: 1}},
      )
      const newFixtures = planFixtureRounds({
        seasonId: season.id,
        userId: user.id,
        startingDate: body.startingDate,
        roundCount: body.roundCount,
        slots: body.slots,
        teams,
        existingFixtures,
      })
      if (newFixtures.length) await $Fixture.createMany(newFixtures)
    },
  }),
])
