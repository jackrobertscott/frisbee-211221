import {io, TypeIoValue} from '@shared/torva'

export const ioTeam = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.id(),
  isMock: io.optional(io.boolean()), // for testing purposes
  name: io.string(),
  color: io.color(),
  division: io.optional(io.number()),
  phone: io.optional(io.string().trim().emptyok()),
  email: io.optional(io.string().trim().email().emptyok()),
})

export type TTeam = TypeIoValue<typeof ioTeam>
