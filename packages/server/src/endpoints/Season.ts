import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {regex} from '../utils/regex'
import {requireUserAdmin} from './requireUserAdmin'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
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
    handler: (body) => async (req) => {
      await requireUser(req)
      return $Season.getMany({name: regex.from(body.search ?? '')})
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SeasonListOfUser',
    handler: () => async (req) => {
      const [user] = await requireUser(req)
      if (user.admin) return $Season.getMany({})
      const members = await $Member.getMany({userId: user.id, pending: false})
      const memberTeamIds = members.map((i) => i.teamId)
      const teams = await $Team.getMany({id: {$in: memberTeamIds}})
      const teamSeasonIds = teams.map((i) => i.seasonId)
      return $Season.getMany({
        $or: [{signUpOpen: true}, {id: {$in: teamSeasonIds}}],
      })
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
