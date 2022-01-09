import {io, TioValue} from 'torva'
/**
 *
 */
export const ioSeason = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  name: io.string(),
  signUpOpen: io.boolean(),
})
/**
 *
 */
export type TSeason = TioValue<typeof ioSeason>
