import {io, TypeIoValue} from 'torva'
/**
 *
 */
export const ioPost = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.optional(io.string()),
  userId: io.string(),
  title: io.string(),
  content: io.string(),
})
/**
 *
 */
export type TPost = TypeIoValue<typeof ioPost>
