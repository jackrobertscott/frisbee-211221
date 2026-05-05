import {badRequestError, conflictError, forbiddenError} from '@shared/errors'
import {
  MemberAcceptOrDeclineDef,
  MemberCreateDef,
  MemberListOfTeamDef,
  MemberLookupByEmailDef,
  MemberRemoveDef,
  MemberRequestCreateDef,
  MemberSetCaptainDef,
} from '@shared/endpoints/MemberDef'
import {TMember} from '@shared/schemas/ioMember'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {requireAccess} from './requireAccess'
import {requireTeam} from './requireTeam'
import {userEmail} from './userEmail'
import {selectPublicUserFields} from './userPublic'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...MemberListOfTeamDef,
    handler: (teamId, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      let memberCurrent: TMember | undefined
      if (!user.admin) [, memberCurrent] = await requireTeam(user, teamId)
      else memberCurrent = await $Member.maybeOne({userId: user.id, teamId})
      // pending and non-pending
      const members = await $Member.getMany({teamId})
      const users = await $User.getMany({
        id: {$in: members.map((i) => i.userId)},
      })
      return {
        current: memberCurrent,
        members,
        users: users.map(selectPublicUserFields),
      }
    },
  }),

  createEndpoint({
    ...MemberLookupByEmailDef,
    handler:
      ({teamId, email}, access) =>
      async (req) => {
        const [userCurrent] = await requireAccess(req, access)
        if (!userCurrent.admin) {
          const [, memberCurrent] = await requireTeam(userCurrent, teamId)
          if (!memberCurrent.captain)
            throw forbiddenError(
              'Failed: only the team captain can add members.',
              {
                errorCode: 'member.captain_required',
              },
            )
        }
        const user = await userEmail.maybeUser(email)
        return {
          exists: !!user,
          user: user ? selectPublicUserFields(user) : undefined,
        }
      },
  }),

  createEndpoint({
    ...MemberCreateDef,
    handler:
      ({teamId, email, ...body}, access) =>
      async (req) => {
        const [userCurrent] = await requireAccess(req, access)
        if (!userCurrent.admin) {
          const [, memberCurrent] = await requireTeam(userCurrent, teamId)
          if (!memberCurrent.captain)
            throw forbiddenError(
              'Failed: only the team captain can add members.',
              {
                errorCode: 'member.captain_required',
              },
            )
        }
        const team = await $Team.getOne({id: teamId})
        let user = await userEmail.maybeUser(email)
        if (!user) {
          if (!body.firstName?.trim() || !body.lastName?.trim() || !body.gender)
            throw badRequestError(
              'First name, last name, and gender are required for a new user.',
              {errorCode: 'member.user_details_required'},
            )
          let raw: any = body
          const emails = [userEmail.create(email, true)]
          user = await $User.createOne({
            ...raw,
            termsAccepted: false,
            emails,
          })
        }
        const member = await $Member.maybeOne({
          userId: user.id,
          seasonId: team.seasonId,
        })
        if (member) {
          if (member.teamId !== team.id)
            throw conflictError('User is already a member of another team.', {
              errorCode: 'member.already_on_other_team',
            })
          return $Member.updateOne(
            {id: member.id},
            {pending: false, updatedOn: new Date().toISOString()},
          )
        }
        return $Member.createOne({
          userId: user.id,
          seasonId: team.seasonId,
          teamId: team.id,
          pending: false,
        })
      },
  }),

  createEndpoint({
    ...MemberRemoveDef,
    handler: (memberId, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const memberDelete = await $Member.maybeOne({id: memberId})
      if (!memberDelete) return
      if (memberDelete.captain) {
        try {
          await $Member.updateOne(
            {
              pending: false,
              teamId: memberDelete.teamId,
              id: {$not: {$eq: memberDelete.id}},
            },
            {captain: true},
          )
        } catch {} // ignore
      }
      if (!user.admin) {
        const [, member] = await requireTeam(user, memberDelete.teamId)
        if (!member.captain && member.id !== memberDelete.id)
          throw forbiddenError(
            'Failed: only the team captain can delete members.',
            {
              errorCode: 'member.captain_required',
            },
          )
      }
      await $Member.deleteOne({id: memberId})
    },
  }),

  createEndpoint({
    ...MemberRequestCreateDef,
    handler: (teamId, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const team = await $Team.getOne({id: teamId})
      const member = await $Member.maybeOne({userId: user.id, teamId: team.id})
      if (member) {
        const message = 'You have already requested membership to this team.'
        throw conflictError(message, {
          errorCode: 'member.request_exists',
        })
      }
      if (await $Member.count({userId: user.id, seasonId: team.seasonId})) {
        const message = 'You have already requested membership to another team.'
        throw conflictError(message, {
          errorCode: 'member.request_exists',
        })
      }
      return $Member.createOne({
        seasonId: team.seasonId,
        teamId: team.id,
        userId: user.id,
        pending: true,
      })
    },
  }),

  createEndpoint({
    ...MemberAcceptOrDeclineDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const memberToAdd = await $Member.getOne({id: body.memberId})
      if (!user.admin) {
        const [_, member] = await requireTeam(user, memberToAdd.teamId)
        if (!member.captain) {
          const message =
            'Failed: only the team captain can accept or deny members.'
          throw forbiddenError(message, {
            errorCode: 'member.captain_required',
          })
        }
      }
      if (body.accept) {
        await $Member.updateOne({id: memberToAdd.id}, {pending: false})
      } else {
        await $Member.deleteOne({id: memberToAdd.id})
      }
    },
  }),

  createEndpoint({
    ...MemberSetCaptainDef,
    handler: (memberId, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const memberNewCaptain = await $Member.getOne({id: memberId})
      if (memberNewCaptain.captain)
        throw conflictError('This member is already the captain of the team.', {
          errorCode: 'member.already_captain',
        })
      if (!user.admin) {
        const [_, member] = await requireTeam(user, memberNewCaptain.teamId)
        if (!member.captain) {
          const message =
            'Failed: only the team captain can perform this action.'
          throw forbiddenError(message, {
            errorCode: 'member.captain_required',
          })
        }
      }
      try {
        await $Member.updateOne(
          {teamId: memberNewCaptain.teamId, captain: true},
          {captain: false},
        )
      } catch {} // ignore
      return $Member.updateOne(
        {id: memberNewCaptain.id},
        {captain: true, pending: false},
      )
    },
  }),
])
