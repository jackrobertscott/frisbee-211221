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
    path: '/MemberListOfUser',
    handler: () => async (req) => {
      const [user] = await requireUser(req)
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
      const [team] = await requireTeam(user, teamId)
      const members = await $Member.getMany({teamId: team.id})
      const users = await $User.getMany({
        id: {$in: members.map((i) => i.userId)},
      })
      return {
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
    }),
    handler:
      ({teamId, ...body}) =>
      async (req) => {
        const [user] = await requireUser(req)
        const [team] = await requireTeam(user, teamId)
        const userMember = await $User.maybeOne({
          email: regex.normalize(body.email),
        })
        if (!userMember)
          throw new Error(`User does not exist with the email "${body.email}".`)
        const member = await $Member.getOne({
          userId: user.id,
          teamId: team.id,
        })
        if (member) {
          return $Member.updateOne(
            {id: member.id},
            {pending: false, updatedOn: new Date().toISOString()}
          )
        }
        return $Member.createOne({
          userId: user.id,
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
      const member = await $Member.maybeOne({id: memberId})
      if (!member) return
      const [team] = await requireTeam(user, member.teamId)
      const countMembersOfTeam = await $Member.count({
        teamId: team.id,
        pending: false,
      })
      if (countMembersOfTeam <= 1)
        throw new Error('There must be at least one valid member remaining.')
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
        const message =
          'User is already a' + member.pending
            ? ' pending'
            : '' + ' member of team.'
        throw new Error(message)
      }
      return $Member.createOne({
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
      const member = await $Member.getOne({id: body.memberId})
      await requireTeam(user, member.teamId)
      if (body.accept) {
        await $Member.updateOne({id: member.id}, {pending: false})
      } else {
        await $Member.deleteOne({id: member.id})
      }
    },
  }),
])
