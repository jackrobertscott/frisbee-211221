import {io, TypeIoValue} from '@shared/torva'

export const ioReport = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  teamId: io.string(),
  teamAgainstId: io.string(),
  fixtureId: io.string(),
  userId: io.optional(io.string()),
  scoreFor: io.number(),
  scoreAgainst: io.number(),

  // MVPs
  mvpMale: io.optional(io.string()), // 5 points
  mvpMale2: io.optional(io.string()), // 3 points
  mvpFemale: io.optional(io.string()), // 5 points
  mvpFemale2: io.optional(io.string()), // 3 points

  // Spirit
  spirit: io.optional(io.number()), // Non-Official version of the Spirit of the Game
  spiritComment: io.string().emptyok(),
  spiritP1: io.optional(io.number()), // Rules Knowledge and Use
  spiritP2: io.optional(io.number()), // Fouls and Body Contact
  spiritP3: io.optional(io.number()), // Fair-Mindedness
  spiritP4: io.optional(io.number()), // Attitude and Self-Control
  spiritP5: io.optional(io.number()), // Communication
})

export type TReport = TypeIoValue<typeof ioReport>
