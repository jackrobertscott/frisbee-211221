import {ioFixture} from '@shared/schemas/ioFixture'
import {ioReport} from '@shared/schemas/ioReport'
import {ioTeam} from '@shared/schemas/ioTeam'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

export const ReportListOfFixtureDef = {
  path: '/ReportListOfFixture',
  payload: io.object({
    fixtureId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioReport),
} satisfies TEndpointDef

export const ReportListOfSeasonDef = {
  path: '/ReportListOfSeason',
  payload: io.object({
    seasonId: io.string(),
  }),
  result: io.object({
    count: io.number(),
    reports: io.array(ioReport),
    fixtures: io.array(ioFixture),
  }),
} satisfies TEndpointDef

export const ReportGetFixtureAgainstDef = {
  path: '/ReportGetFixtureAgainst',
  payload: io.object({
    teamId: io.string(),
    fixtureId: io.string(),
  }),
  result: io.array(
    io.object({
      team: ioTeam,
      users: io.array(ioUserPublic),
    })
  ),
} satisfies TEndpointDef

export const ReportCreateDef = {
  path: '/ReportCreate',
  payload: io.object({
    teamId: io.string(),
    againstTeamId: io.string(),
    fixtureId: io.string(),
    scoreFor: io.number(),
    scoreAgainst: io.number(),
    mvpMale: io.optional(io.string()),
    mvpFemale: io.optional(io.string()),
    spirit: io.number(),
    spiritComment: io.string().emptyok(),
  }),
  result: ioReport,
} satisfies TEndpointDef

export const ReportUpdateDef = {
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
  result: ioReport,
} satisfies TEndpointDef

export const ReportDeleteDef = {
  path: '/ReportDelete',
  payload: io.object({
    reportId: io.string(),
  }),
} satisfies TEndpointDef

export const ReportMissingListDef = {
  path: '/ReportMissingList',
  payload: io.object({
    seasonId: io.string(),
  }),
  result: io.array(
    io.object({
      title: io.string(),
      fixtureId: io.string(),
      date: io.date(),
      missingTeams: io.array(
        io.object({
          id: io.string(),
          name: io.string(),
          color: io.optional(io.string()),
          againstId: io.optional(io.string()),
          againstName: io.optional(io.string()),
        })
      ),
    })
  ),
} satisfies TEndpointDef