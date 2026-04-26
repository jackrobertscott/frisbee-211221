import {io, TypeIoValue} from 'torva'

export const ioMember = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.string(),
  seasonId: io.string(),
  teamId: io.string(),
  isMock: io.optional(io.boolean()), // for testing purposes
  captain: io.optional(io.boolean()),
  pending: io.boolean(),
})

export type TMember = TypeIoValue<typeof ioMember>
