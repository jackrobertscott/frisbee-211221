import {io, TioValue} from 'torva'
/**
 *
 */
export const ioReport = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  teamId: io.string(),
  teamAgainstId: io.string(),
  roundId: io.string(),
  userId: io.optional(io.string()),
  scoreFor: io.number(),
  scoreAgainst: io.number(),
  mvpMale: io.optional(io.string()),
  mvpFemale: io.optional(io.string()),
  spirit: io.number(),
  spiritComment: io.string().emptyok(),
})
/**
 *
 */
export type TReport = TioValue<typeof ioReport>
