import {io, TypeIoValue} from 'torva'
/**
 *
 */
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
  gamedayRegistrationId: io.optional(io.string()), // GameDay registration ID for sync tracking
})
/**
 *
 */
export type TMember = TypeIoValue<typeof ioMember>
