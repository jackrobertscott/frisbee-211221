import {io, TioValue} from 'torva'
/**
 *
 */
export const ioMember = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  seasonId: io.string(),
  teamId: io.string(),
  captain: io.optional(io.boolean()),
  pending: io.boolean(),
})
/**
 *
 */
export type TMember = TioValue<typeof ioMember>
