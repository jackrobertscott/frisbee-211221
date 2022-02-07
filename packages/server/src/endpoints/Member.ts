import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireTeam} from './requireTeam'
import {$User} from '../tables/$User'
import {TMember} from '../schemas/ioMember'
import {userEmail} from './userEmail'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/MemberListOfUser',
    handler: () => async (req) => {
      const [user] = await requireUser(req)
      // pending and non-pending
      const members = await $Member.getMany({userId: user.id})
      const teams = await $Team.getMany({
        id: {$in: members.map((i) => i.teamId)},
      })
      return {
        members,
        teams,
      }
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/MemberListOfTeam',
    payload: io.string(),
    handler: (teamId) => async (req) => {
      const [user] = await requireUser(req)
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
        users,
      }
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/MemberDelete',
    payload: io.string(),
    handler: (teamId) => async (req) => {
      const [user] = await requireUser(req)
      let memberCurrent: TMember | undefined
      if (!user.admin) [, memberCurrent] = await requireTeam(user, teamId)
      // pending and non-pending
      const members = await $Member.getMany({teamId})
      const users = await $User.getMany({
        id: {$in: members.map((i) => i.userId)},
      })
      return {
        current: memberCurrent,
        members,
        users,
      }
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/MemberCreate',
    payload: io.object({
      teamId: io.string(),
      email: io.string().email(),
      firstName: io.optional(io.string().emptyok()),
      lastName: io.optional(io.string().emptyok()),
      gender: io.optional(io.string()),
    }),
    handler:
      ({teamId, email, ...body}) =>
      async (req) => {
        const [userCurrent] = await requireUser(req)
        if (!userCurrent.admin) {
          const [, memberCurrent] = await requireTeam(userCurrent, teamId)
          if (!memberCurrent.captain)
            throw new Error('Failed: only the team captain can add members.')
        }
        const team = await $Team.getOne({id: teamId})
        let user = await userEmail.maybeUser(email)
        if (!user) {
          let raw: any = body
          user = await $User.createOne({
            ...raw,
            termsAccepted: false,
            emails: [userEmail.create(email, true)],
          })
        }
        const member = await $Member.maybeOne({
          userId: user.id,
          seasonId: team.seasonId,
        })
        if (member) {
          if (member.teamId !== team.id)
            throw new Error('User is already a member of another team.')
          return $Member.updateOne(
            {id: member.id},
            {pending: false, updatedOn: new Date().toISOString()}
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
  /**
   *
   */
  createEndpoint({
    path: '/MemberRemove',
    payload: io.string(),
    handler: (memberId) => async (req) => {
      const [user] = await requireUser(req)
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
            {captain: true}
          )
        } catch {} // ignore
      }
      if (!user.admin) {
        const [, member] = await requireTeam(user, memberDelete.teamId)
        if (!member.captain && member.id !== memberDelete.id)
          throw new Error('Failed: only the team captain can delete members.')
      }
      await $Member.deleteOne({id: memberId})
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/MemberRequestCreate',
    payload: io.string(),
    handler: (teamId) => async (req) => {
      const [user] = await requireUser(req)
      const team = await $Team.getOne({id: teamId})
      const member = await $Member.maybeOne({userId: user.id, teamId: team.id})
      if (member) {
        const message = 'You have already requested membership to this team.'
        throw new Error(message)
      }
      if (await $Member.count({userId: user.id, seasonId: team.seasonId})) {
        const message = 'You have already requested membership to another team.'
        throw new Error(message)
      }
      return $Member.createOne({
        seasonId: team.seasonId,
        teamId: team.id,
        userId: user.id,
        pending: true,
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/MemberAcceptOrDecline',
    payload: io.object({
      memberId: io.string(),
      accept: io.boolean(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      const memberToAdd = await $Member.getOne({id: body.memberId})
      if (!user.admin) {
        const [_, member] = await requireTeam(user, memberToAdd.teamId)
        if (!member.captain) {
          const message =
            'Failed: only the team captain can accept or deny members.'
          throw new Error(message)
        }
      }
      if (body.accept) {
        await $Member.updateOne({id: memberToAdd.id}, {pending: false})
      } else {
        await $Member.deleteOne({id: memberToAdd.id})
      }
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/MemberSetCaptain',
    payload: io.string(),
    handler: (memberId) => async (req) => {
      const [user] = await requireUser(req)
      const memberNewCaptain = await $Member.getOne({id: memberId})
      if (memberNewCaptain.captain)
        throw new Error('This member is already the captain of the team.')
      if (!user.admin) {
        const [_, member] = await requireTeam(user, memberNewCaptain.teamId)
        if (!member.captain) {
          const message =
            'Failed: only the team captain can perform this action.'
          throw new Error(message)
        }
      }
      try {
        await $Member.updateOne(
          {teamId: memberNewCaptain.teamId, captain: true},
          {captain: false}
        )
      } catch {} // ignore
      return $Member.updateOne(
        {id: memberNewCaptain.id},
        {captain: true, pending: false}
      )
    },
  }),
])
