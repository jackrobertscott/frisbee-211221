import {io} from 'torva'
import {ioReport} from '../schemas/Report'
import {ioTeam} from '../schemas/Team'
import {ioUser} from '../schemas/User'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $ReportListOfRound = createEndpoint({
  path: '/ReportListOfRound',
  payload: io.object({
    roundId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioReport),
})
/**
 *
 */
export const $ReportGetRound = createEndpoint({
  path: '/ReportGetRound',
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
