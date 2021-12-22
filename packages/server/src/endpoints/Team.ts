import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Member} from '../tables/Member'
import {$Team} from '../tables/Team'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireTeam} from './requireTeam'
import {$User} from '../tables/User'
import {regex} from '../utils/regex'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/TeamList',
    payload: io.object({
      search: io.optional(io.string().emptyok()),
      limit: io.optional(io.number()),
    }),
    handler: (body) => async (req) => {
      await requireUser(req)
      return $Team.getMany(
        {name: regex.from(body.search ?? '')},
        {limit: body.limit ?? 10}
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/TeamCreate',
    payload: io.object({
      name: io.string(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      const team = await $Team.createOne(body)
      const member = await $Member.createOne({
        userId: user.id,
        teamId: team.id,
        pending: false,
      })
      await $User.updateOne({id: user.id}, {lastMemberId: member.id})
      return {
        team,
        member,
      }
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/TeamUpdate',
    payload: io.object({
      teamId: io.string(),
      name: io.string(),
    }),
    handler:
      ({teamId, ...body}) =>
      async (req) => {
        const [user] = await requireUser(req)
        const [team] = await requireTeam(user, teamId)
        return $Team.updateOne(
          {id: team.id},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/TeamSwitch',
    payload: io.string(),
    handler: (teamId) => async (req) => {
      const [user] = await requireUser(req)
      const [_, member] = await requireTeam(user, teamId)
      await $User.updateOne({id: user.id}, {lastMemberId: member.id})
    },
  }),
])
