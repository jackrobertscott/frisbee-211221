import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Season} from '../tables/Season'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {regex} from '../utils/regex'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/SeasonList',
    payload: io.object({
      search: io.optional(io.string().emptyok()),
      limit: io.optional(io.number()),
    }),
    handler: (body) => async (req) => {
      await requireUser(req)
      return $Season.getMany(
        {name: regex.from(body.search ?? '')},
        {limit: body.limit}
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SeasonCreate',
    payload: io.object({
      name: io.string(),
      closed: io.boolean(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      const season = await $Season.createOne(body)
      // todo...
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SeasonUpdate',
    payload: io.object({
      seasonId: io.string(),
      name: io.string(),
      closed: io.boolean(),
    }),
    handler:
      ({seasonId, ...body}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return $Season.updateOne(
          {id: seasonId},
          {...body, updatedOn: new Date().toISOString()}
        )
        // todo...
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SeasonSwitch',
    payload: io.string(),
    handler: (seasonId) => async (req) => {
      const [user] = await requireUser(req)
      // todo...
    },
  }),
])
