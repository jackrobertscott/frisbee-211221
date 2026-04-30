import {badRequestError, conflictError, forbiddenError} from '@shared/errors'
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

export default new Map<string, RequestHandler>([

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

  createEndpoint({
    ...TeamCurrentCreateDef,
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      const season = await $Season.getOne({id: body.seasonId})
      if (!season.signUpOpen)
        throw badRequestError('Season is not currently open for new team sign ups.', {
          errorCode: 'team.signup_closed',
        })
      if (await $Member.count({userId: user.id, seasonId: season.id}))
        throw conflictError('User is already a member of another team.', {
          errorCode: 'member.already_on_other_team',
        })
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

  createEndpoint({
    ...TeamCurrentUpdateDef,
    handler:
      ({teamId, ...body}) =>
      async (req) => {
        const [user] = await requireUser(req)
        const [team, member] = await requireTeam(user, teamId)
        if (member.pending)
          throw forbiddenError('Pending members cannot update team information.', {
            errorCode: 'team.pending_member_forbidden',
          })
        return $Team.updateOne(
          {id: team.id},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),

  createEndpoint({
    ...TeamCreateDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      return $Team.createOne(body)
    },
  }),

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
