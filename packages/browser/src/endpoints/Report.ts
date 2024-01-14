import {io} from 'torva'
import {ioFixture} from '../schemas/ioFixture'
import {ioReport} from '../schemas/ioReport'
import {ioTeam} from '../schemas/ioTeam'
import {ioUserPublic} from '../schemas/ioUser'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $ReportListOfFixture = createEndpoint({
  path: '/ReportListOfFixture',
  payload: io.object({
    fixtureId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioReport),
})
/**
 *
 */
export const $ReportListOfSeason = createEndpoint({
  path: '/ReportListOfSeason',
  payload: io.object({
    seasonId: io.string(),
  }),
  result: io.object({
    count: io.number(),
    reports: io.array(ioReport),
    fixtures: io.array(ioFixture),
  }),
})
/**
 *
 */
export const $ReportGetFixtureAgainst = createEndpoint({
  path: '/ReportGetFixtureAgainst',
  payload: io.object({
    teamId: io.string(),
    fixtureId: io.string(),
  }),
  result: io.array(io.object({
    teamAgainst: ioTeam,
    users: io.array(ioUserPublic),
  })),
})
/**
 *
 */
export const $ReportCreate = createEndpoint({
  path: '/ReportCreate',
  payload: io.object({
    teamId: io.string(),
    fixtureId: io.string(),
    scoreFor: io.number(),
    scoreAgainst: io.number(),
    mvpMale: io.optional(io.string()),
    mvpFemale: io.optional(io.string()),
    spirit: io.number(),
    spiritComment: io.string(),
  }),
  result: ioReport,
})
/**
 *
 */
export const $ReportUpdate = createEndpoint({
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
})
/**
 *
 */
export const $ReportDelete = createEndpoint({
  path: '/ReportDelete',
  payload: io.object({
    reportId: io.string(),
  }),
})
