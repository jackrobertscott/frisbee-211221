import {io, TioValue} from 'torva'
/**
 *
 */
export const ioReport = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  teamId: io.string(),
  roundId: io.string(),
  scoreFor: io.number(),
  scoreAgainst: io.number(),
  mvpMale: io.optional(io.string()),
  mvpFemale: io.optional(io.string()),
})
/**
 *
 */
export type TReport = TioValue<typeof ioReport>
