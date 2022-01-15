import {io} from 'torva'
import {ioReport} from '../schemas/ioReport'
import {ioTeam} from '../schemas/ioTeam'
import {ioUser} from '../schemas/ioUser'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $ReportListOfFixture = createEndpoint({
  path: '/ReportListOfFixture',
  payload: io.object({
    roundId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioReport),
})
/**
 *
 */
export const $ReportGetFixture = createEndpoint({
  path: '/ReportGetFixture',
  payload: io.object({
    teamId: io.string(),
    roundId: io.string(),
  }),
  result: io.object({
    teamAgainst: ioTeam,
    users: io.array(ioUser),
  }),
})
/**
 *
 */
export const $ReportCreate = createEndpoint({
  path: '/ReportCreate',
  payload: io.object({
    teamId: io.string(),
    roundId: io.string(),
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
export const $ReportDelete = createEndpoint({
  path: '/ReportDelete',
  payload: io.object({
    reportId: io.string(),
  }),
})
