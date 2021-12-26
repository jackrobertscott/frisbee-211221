import {io, TioValue} from 'torva'
/**
 *
 */
export const ioReport = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  teamId: io.string(),
  roundId: io.string(),
  scoreSelf: io.number(),
  scoreOpposition: io.number(),
})
/**
 *
 */
export type TReport = TioValue<typeof ioReport>
