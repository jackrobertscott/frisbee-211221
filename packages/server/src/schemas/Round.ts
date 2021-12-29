import {io, TioValue} from 'torva'
/**
 *
 */
export const ioRoundGame = io.object({
  id: io.string(),
  team1Id: io.string(),
  team2Id: io.string(),
  place: io.string(),
  time: io.string(),
})
/**
 *
 */
export const ioRound = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.string(),
  userId: io.string(),
  title: io.string(),
  date: io.date(),
  games: io.array(ioRoundGame),
})
/**
 *
 */
export type TRound = TioValue<typeof ioRound>
