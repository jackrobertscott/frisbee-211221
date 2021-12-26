import {io, TioValue} from 'torva'
/**
 *
 */
export const ioRound = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
})
/**
 *
 */
export type TRound = TioValue<typeof ioRound>
