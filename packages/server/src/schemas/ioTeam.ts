import {io, TioValue} from 'torva'
/**
 *
 */
export const ioTeam = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.string(),
  name: io.string(),
  color: io.string(),
  division: io.optional(io.number()),
})
/**
 *
 */
export type TTeam = TioValue<typeof ioTeam>
