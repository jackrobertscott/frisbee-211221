import {badRequestError, conflictError} from '@shared/errors'
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
import {createEndpoint} from '../http/createEndpoint'
import {requireAccess} from '../auth/requireAccess'
import {requireTeam} from '../auth/requireTeam'
import {userEmail} from '../services/userEmail'
import {requireCaptainOrAdmin} from '../services/teamCaptaincy'
import {selectPublicUserFields} from '../services/userFields'

const ADD_MEMBERS_MESSAGE = 'Failed: only the team captain can add members.'

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
        await requireCaptainOrAdmin(userCurrent, teamId, ADD_MEMBERS_MESSAGE)
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
        await requireCaptainOrAdmin(userCurrent, teamId, ADD_MEMBERS_MESSAGE)
        const team = await $Team.getOne({id: teamId})
        let user = await userEmail.maybeUser(email)
        if (!user) {
          if (!body.firstName?.trim() || !body.lastName?.trim() || !body.genderMatching)
            throw badRequestError(
              'First name, last name, and gender matching are required for a new user.',
              {errorCode: 'member.user_details_required'},
            )
          const emails = [userEmail.create(email, true)]
          user = await $User.createOne({
            firstName: body.firstName,
            lastName: body.lastName,
            genderMatching: body.genderMatching,
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
      await requireCaptainOrAdmin(
        user,
        memberDelete.teamId,
        'Failed: only the team captain can delete members.',
        (member) => member.id === memberDelete.id, // members may leave
      )
      if (memberDelete.captain) {
        const successor = await $Member.maybeOne(
          {
            pending: false,
            teamId: memberDelete.teamId,
            id: {$ne: memberDelete.id},
          },
          {sort: {createdOn: 1}},
        )
        if (successor)
          await $Member.updateOne({id: successor.id}, {captain: true})
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
      await requireCaptainOrAdmin(
        user,
        memberToAdd.teamId,
        'Failed: only the team captain can accept or deny members.',
      )
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
      await requireCaptainOrAdmin(
        user,
        memberNewCaptain.teamId,
        'Failed: only the team captain can perform this action.',
      )
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
