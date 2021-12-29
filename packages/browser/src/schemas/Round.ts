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
  team1Score: io.optional(io.number()),
  team2Score: io.optional(io.number()),
})
/**
 *
 */
export const ioRound = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  title: io.string(),
  date: io.date(),
  games: io.array(ioRoundGame),
})
/**
 *
 */
export type TRound = TioValue<typeof ioRound>
