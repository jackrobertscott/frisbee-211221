import {io, TypeIoValue} from '@shared/torva'

export const ioPost = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.optional(io.id()),
  userId: io.id(),
  title: io.string(),
  content: io.string(),
})

export type TPost = TypeIoValue<typeof ioPost>
