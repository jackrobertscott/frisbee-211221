import {badRequestError, conflictError, forbiddenError} from '@shared/errors'
import {
  TeamCreateDef,
  TeamCurrentCreateDef,
  TeamDeleteDef,
  TeamUpdateDef,
  TeamCurrentUpdateDef,
} from '@shared/endpoints/TeamDef'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {requireAccess} from './requireAccess'
import {requireTeam} from './requireTeam'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...TeamCurrentCreateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const season = await $Season.getOne({id: body.seasonId})
      if (!season.signUpOpen)
        throw badRequestError(
          'Season is not currently open for new team sign ups.',
          {
            errorCode: 'team.signup_closed',
          },
        )
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
      ({teamId, ...body}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        const [team, member] = await requireTeam(user, teamId)
        if (member.pending)
          throw forbiddenError(
            'Pending members cannot update team information.',
            {
              errorCode: 'team.pending_member_forbidden',
            },
          )
        if (!member.captain)
          throw forbiddenError(
            'Only the team captain can update team information.',
            {
              errorCode: 'team.captain_required',
            },
          )
        return $Team.updateOne(
          {id: team.id},
          {...body, updatedOn: new Date().toISOString()},
        )
      },
  }),

  createEndpoint({
    ...TeamCreateDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      await $Season.getOne({id: body.seasonId})
      return $Team.createOne(body)
    },
  }),

  createEndpoint({
    ...TeamUpdateDef,
    handler:
      ({teamId, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const team = await $Team.getOne({id: teamId})
        return $Team.updateOne(
          {id: team.id},
          {...body, updatedOn: new Date().toISOString()},
        )
      },
  }),

  createEndpoint({
    ...TeamDeleteDef,
    handler:
      ({teamId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Member.deleteMany({teamId})
        await $Team.deleteOne({id: teamId})
      },
  }),
])
