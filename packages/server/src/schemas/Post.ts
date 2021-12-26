import {io, TioValue} from 'torva'
/**
 *
 */
export const ioPost = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  title: io.string(),
  content: io.string(),
})
/**
 *
 */
export type TPost = TioValue<typeof ioPost>
