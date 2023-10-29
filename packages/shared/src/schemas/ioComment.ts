import {io, TypeIoValue} from 'torva'
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
  commentParentId: io.optional(io.string()),
})
/**
 *
 */
export type TComment = TypeIoValue<typeof ioComment>
