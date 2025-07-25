import {io, TypeIoValue} from 'torva'
/**
 *
 */
export const ioTeam = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  seasonId: io.string(),
  isMock: io.optional(io.boolean()), // for testing purposes
  name: io.string(),
  color: io.string(),
  division: io.optional(io.number()),
  phone: io.optional(io.string().emptyok()),
  email: io.optional(io.string().emptyok()),
  gamedayId: io.optional(io.string()), // GameDay team ID for sync tracking
  grade: io.optional(io.string()), // GameDay grade information
  ageGroup: io.optional(io.string()), // GameDay age group information
  shortName: io.optional(io.string()), // GameDay short name
})
/**
 *
 */
export type TTeam = TypeIoValue<typeof ioTeam>
