import {io, TypeIoValue} from 'torva'
/**
 *
 */
export const ioFixtureGame = io.object({
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
export const ioFixture = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.string(),
  userId: io.string(),
  title: io.string(),
  date: io.date(),
  games: io.array(ioFixtureGame),
  grading: io.optional(io.boolean()),
})
/**
 *
 */
export type TFixture = TypeIoValue<typeof ioFixture>
