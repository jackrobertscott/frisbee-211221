import {io, TypeIoValue} from '@shared/torva'

export const ioComment = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.id(),
  postId: io.id(),
  content: io.string(),
  commentParentId: io.optional(io.id()),
})

export type TComment = TypeIoValue<typeof ioComment>
