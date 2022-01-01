import {io, TioValue} from 'torva'
/**
 *
 */
export const ioRequest = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  teamId: io.string(),
  content: io.string(),
})
/**
 *
 */
export type TRequest = TioValue<typeof ioRequest>
