import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Report} from '../tables/$Report'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
import {$Fixture} from '../tables/$Fixture'
import {requireTeam} from './requireTeam'
import {$Team} from '../tables/$Team'
import {$Member} from '../tables/$Member'
import {$User} from '../tables/$User'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/ReportListOfFixture',
    payload: io.object({
      roundId: io.string(),
      limit: io.optional(io.number()),
    }),
    handler:
      ({roundId, limit}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Report.getMany({roundId}, {limit, sort: {createdOn: -1}})
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/ReportGetFixture',
    payload: io.object({
      teamId: io.string(),
      roundId: io.string(),
    }),
    handler:
      ({teamId, roundId}) =>
      async (req) => {
        const [user] = await requireUser(req)
        const [team] = await requireTeam(user, teamId)
        const fixture = await $Fixture.getOne({id: roundId})
        let teamAgainstId: string | undefined
        for (const game of fixture.games) {
          if (game.team1Id === team.id) {
            teamAgainstId = game.team2Id
            break
          }
          if (game.team2Id === team.id) {
            teamAgainstId = game.team1Id
            break
          }
        }
        if (!teamAgainstId) {
          const message =
            'Failed to find the opposition team. Your team is may not be playing in this fixture.'
          throw new Error(message)
        }
        const teamAgainst = await $Team.getOne({id: teamAgainstId})
        const members = await $Member.getMany({
          teamId: teamAgainst.id,
          pending: false,
        })
        const users = await $User.getMany({
          id: {$in: members.map((i) => i.userId)},
        })
        return {
          teamAgainst,
          users,
        }
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/ReportCreate',
    payload: io.object({
      teamId: io.string(),
      roundId: io.string(),
      scoreFor: io.number(),
      scoreAgainst: io.number(),
      mvpMale: io.optional(io.string()),
      mvpFemale: io.optional(io.string()),
      spirit: io.number(),
      spiritComment: io.string().emptyok(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      const [team] = await requireTeam(user, body.teamId)
      const fixture = await $Fixture.getOne({id: body.roundId})
      let teamAgainstId: string | undefined
      for (const game of fixture.games) {
        if (game.team1Id === team.id) {
          teamAgainstId = game.team2Id
          break
        }
        if (game.team2Id === team.id) {
          teamAgainstId = game.team1Id
          break
        }
      }
      if (!teamAgainstId) {
        const message =
          'Failed to find the opposition team. Your team is may not be playing in this fixture.'
        throw new Error(message)
      }
      const teamAgainst = await $Team.getOne({id: teamAgainstId})
      return $Report.createOne({
        ...body,
        userId: user.id,
        teamAgainstId: teamAgainst.id,
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/ReportDelete',
    payload: io.object({
      reportId: io.string(),
    }),
    handler:
      ({reportId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Report.deleteOne({id: reportId})
      },
  }),
])
