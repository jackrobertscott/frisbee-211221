import {RequestHandler} from 'micro'
import {io} from 'torva'
import {TTeam} from '../schemas/ioTeam'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {requireTeam} from './requireTeam'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
import {userPublic} from './userPublic'
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
      fixtureId: io.string(),
      limit: io.optional(io.number()),
    }),
    handler:
      ({fixtureId, limit}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Report.getMany({fixtureId}, {limit, sort: {createdOn: -1}})
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/ReportListOfSeason',
    payload: io.object({
      seasonId: io.string(),
    }),
    handler:
      ({seasonId}) =>
      async (req) => {
        await requireUserAdmin(req)
        const fixtures = await $Fixture.getMany({seasonId})
        const query = {fixtureId: {$in: fixtures.map((i) => i.id)}}
        const [count, reports] = await Promise.all([
          $Report.count(query),
          $Report.getMany(query, {sort: {createdOn: -1}}),
        ])
        return {count, reports, fixtures}
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/ReportGetFixtureAgainst',
    payload: io.object({
      teamId: io.string(),
      fixtureId: io.string(),
    }),
    handler:
      ({teamId, fixtureId}) =>
      async (req) => {
        const [user] = await requireUser(req)
        let team: TTeam
        if (user.admin) team = await $Team.getOne({id: teamId})
        else [team] = await requireTeam(user, teamId)
        const fixture = await $Fixture.getOne({id: fixtureId})
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
          users: users.map(userPublic),
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
      fixtureId: io.string(),
      scoreFor: io.number(),
      scoreAgainst: io.number(),
      mvpMale: io.optional(io.string()),
      mvpFemale: io.optional(io.string()),
      spirit: io.number(),
      spiritComment: io.string().emptyok(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      let team: TTeam
      if (user.admin) team = await $Team.getOne({id: body.teamId})
      else [team] = await requireTeam(user, body.teamId)
      const fixture = await $Fixture.getOne({id: body.fixtureId})
      if (await $Report.count({fixtureId: fixture.id, teamId: team.id})) {
        const message = `Report already submitted by ${team.name} for ${fixture.title}.`
        throw new Error(message)
      }
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
    path: '/ReportUpdate',
    payload: io.object({
      reportId: io.string(),
      scoreFor: io.number(),
      scoreAgainst: io.number(),
      mvpMale: io.optional(io.string()),
      mvpFemale: io.optional(io.string()),
      spirit: io.number(),
      spiritComment: io.string().emptyok(),
    }),
    handler:
      ({reportId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Report.updateOne(
          {id: reportId},
          {
            ...body,
            updatedOn: new Date().toISOString(),
          }
        )
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
