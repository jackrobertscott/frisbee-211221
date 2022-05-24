import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireTeam} from './requireTeam'
import {$User} from '../tables/$User'
import {regex} from '../utils/regex'
import {$Season} from '../tables/$Season'
import {requireUserAdmin} from './requireUserAdmin'
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
      limit: io.optional(io.number()),
      skip: io.optional(io.number()),
    }),
    handler: (body) => async (req) => {
      await $Season.getOne({id: body.seasonId})
      const [count, teams] = await Promise.all([
        $Team.count({seasonId: body.seasonId}),
        $Team.getMany(
          {
            seasonId: body.seasonId,
            name: regex.from(body.search ?? ''),
          },
          {
            limit: body.limit,
            skip: body.skip,
          }
        ),
      ])
      return {count, teams}
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/TeamCurrentCreate',
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
      if (await $Member.count({userId: user.id, seasonId: season.id}))
        throw new Error('User is already a member of another team.')
      const team = await $Team.createOne(body)
      const member = await $Member.createOne({
        userId: user.id,
        seasonId: team.seasonId,
        teamId: team.id,
        captain: true,
        pending: false,
      })
      await $User.updateOne({id: user.id}, {lastSeasonId: season.id})
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
    path: '/TeamCurrentUpdate',
    payload: io.object({
      teamId: io.string(),
      name: io.string(),
      color: io.string(),
      phone: io.optional(io.string().emptyok()),
      email: io.optional(io.string().emptyok()),
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
    path: '/TeamCreate',
    payload: io.object({
      seasonId: io.string(),
      name: io.string(),
      color: io.string(),
      phone: io.optional(io.string().emptyok()),
      email: io.optional(io.string().emptyok()),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      return $Team.createOne(body)
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
      phone: io.optional(io.string().emptyok()),
      email: io.optional(io.string().emptyok()),
      division: io.optional(io.number()),
    }),
    handler:
      ({teamId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        const team = await $Team.getOne({id: teamId})
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
    path: '/TeamDelete',
    payload: io.object({
      teamId: io.string(),
    }),
    handler:
      ({teamId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Member.deleteMany({teamId})
        await $Team.deleteOne({id: teamId})
      },
  }),
])
