import {TeamCreateDef, TeamCurrentCreateDef, TeamCurrentUpdateDef, TeamDeleteDef, TeamListOfSeasonDef, TeamUpdateDef} from '@shared/endpoints/TeamDef'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import {requireTeam} from './requireTeam'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    ...TeamListOfSeasonDef,
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
    ...TeamCurrentCreateDef,
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
    ...TeamCurrentUpdateDef,
    handler:
      ({teamId, ...body}) =>
      async (req) => {
        const [user] = await requireUser(req)
        const [team, member] = await requireTeam(user, teamId)
        if (member.pending)
          throw new Error('Pending members cannot update team information.')
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
    ...TeamCreateDef,
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
    ...TeamUpdateDef,
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
    ...TeamDeleteDef,
    handler:
      ({teamId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Member.deleteMany({teamId})
        await $Team.deleteOne({id: teamId})
      },
  }),
])