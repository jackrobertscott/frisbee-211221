import {io, TioValue} from 'torva'
/**
 *
 */
export const ioComment = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  postId: io.string(),
  content: io.string(),
})
/**
 *
 */
export type TComment = TioValue<typeof ioComment>
