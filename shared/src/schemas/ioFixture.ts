import {io, TypeIoValue} from '@shared/torva'

export const ioFixtureGame = io.object({
  id: io.id(),
  team1Id: io.id(),
  team2Id: io.id(),
  place: io.string(),
  time: io.string(),
  team1Score: io.optional(io.number()),
  team2Score: io.optional(io.number()),
})

export const ioFixture = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.id(),
  userId: io.id(),
  title: io.string(),
  date: io.date(),
  games: io.array(ioFixtureGame),
  grading: io.optional(io.boolean()),
})

export type TFixture = TypeIoValue<typeof ioFixture>
