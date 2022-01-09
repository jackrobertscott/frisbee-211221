import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Fixture} from '../tables/$Fixture'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
import {$Season} from '../tables/$Season'
import {ioFixtureGame} from '../schemas/ioFixture'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/FixtureListOfSeason',
    payload: io.object({
      seasonId: io.string(),
      limit: io.optional(io.number()),
    }),
    handler:
      ({seasonId, limit}) =>
      async (req) => {
        await requireUser(req)
        return $Fixture.getMany({seasonId}, {limit, sort: {createdOn: -1}})
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/FixtureCreate',
    payload: io.object({
      seasonId: io.string(),
      title: io.string(),
      date: io.date(),
      games: io.array(ioFixtureGame),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      return $Fixture.createOne({
        ...body,
        userId: user.id,
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/FixtureUpdate',
    payload: io.object({
      roundId: io.string(),
      title: io.string(),
      date: io.date(),
      games: io.array(ioFixtureGame),
    }),
    handler:
      ({roundId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Fixture.updateOne(
          {id: roundId},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/FixtureDelete',
    payload: io.object({
      roundId: io.string(),
    }),
    handler:
      ({roundId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Fixture.deleteOne({id: roundId})
      },
  }),
])
