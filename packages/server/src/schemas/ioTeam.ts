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
  phone: io.optional(io.string().emptyok()),
  email: io.optional(io.string().emptyok()),
})
/**
 *
 */
export type TTeam = TioValue<typeof ioTeam>
