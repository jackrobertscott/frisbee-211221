import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import {requireUserAdmin} from './requireUserAdmin'
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
    }),
    handler: (body) => async () => {
      return $Season.getMany({name: regex.from(body.search ?? '')})
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SeasonCreate',
    payload: io.object({
      name: io.string(),
      signUpOpen: io.boolean(),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      return $Season.createOne(body)
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
      signUpOpen: io.boolean(),
      finalResults: io.optional(
        io.array(
          io.object({
            teamId: io.string(),
            position: io.optional(io.null(io.number())),
          })
        )
      ),
    }),
    handler:
      ({seasonId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Season.updateOne(
          {id: seasonId},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
])
