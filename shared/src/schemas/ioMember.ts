import {io, TypeIoValue} from '@shared/torva'

export const ioMember = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  userId: io.id(),
  seasonId: io.id(),
  teamId: io.id(),
  isMock: io.optional(io.boolean()), // for testing purposes
  captain: io.optional(io.boolean()),
  pending: io.boolean(),
})

export type TMember = TypeIoValue<typeof ioMember>
