import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Fixture} from '../tables/Fixture'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
import {$Season} from '../tables/Season'
import {ioRoundGame} from '../schemas/Fixture'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/RoundListOfSeason',
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
    path: '/RoundCreate',
    payload: io.object({
      seasonId: io.string(),
      title: io.string(),
      date: io.date(),
      games: io.array(ioRoundGame),
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
    path: '/RoundUpdate',
    payload: io.object({
      roundId: io.string(),
      title: io.string(),
      date: io.date(),
      games: io.array(ioRoundGame),
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
    path: '/RoundDelete',
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
