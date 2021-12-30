import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Member} from '../tables/Member'
import {$Team} from '../tables/Team'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireTeam} from './requireTeam'
import {$User} from '../tables/User'
import {regex} from '../utils/regex'
import {$Season} from '../tables/Season'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/TeamListOfSeason',
    payload: io.object({
      seasonId: io.string(),
      search: io.optional(io.string().emptyok()),
    }),
    handler: (body) => async (req) => {
      await requireUser(req)
      await $Season.getOne({id: body.seasonId})
      return $Team.getMany({
        seasonId: body.seasonId,
        name: regex.from(body.search ?? ''),
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/TeamGetOfSeason',
    payload: io.object({
      seasonId: io.string(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      await $Season.getOne({id: body.seasonId})
      const members = await $Member.getMany({
        userId: user.id,
        pending: false,
      })
      const memberTeamIds = members.map((i) => i.teamId)
      return $Team.maybeOne({
        seasonId: body.seasonId,
        id: {$in: memberTeamIds},
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/TeamCreate',
    payload: io.object({
      seasonId: io.string(),
      name: io.string(),
      color: io.string(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      const season = await $Season.getOne({id: body.seasonId})
      if (!season.signUpOpen)
        throw new Error('Season is not currently open for new team sign ups.')
      const team = await $Team.createOne(body)
      const member = await $Member.createOne({
        userId: user.id,
        seasonId: team.seasonId,
        teamId: team.id,
        captain: true,
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
      color: io.string(),
    }),
    handler:
      ({teamId, ...body}) =>
      async (req) => {
        const [user] = await requireUser(req)
        const [team, member] = await requireTeam(user, teamId)
        if (!member.captain)
          throw new Error('Failed: only the team captain can update the team.')
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
