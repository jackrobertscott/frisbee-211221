import {io, TioValue} from 'torva'
/**
 *
 */
export const ioTeam = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  name: io.string(),
})
/**
 *
 */
export type TTeam = TioValue<typeof ioTeam>
