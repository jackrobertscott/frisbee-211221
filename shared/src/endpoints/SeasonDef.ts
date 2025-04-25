import {ioSeason} from '@shared/schemas/ioSeason'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

export const SeasonListDef = {
  path: '/SeasonList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
  }),
  result: io.array(ioSeason),
} satisfies TEndpointDef

export const SeasonCreateDef = {
  path: '/SeasonCreate',
  payload: io.object({
    name: io.string(),
    signUpOpen: io.boolean(),
    useOfficialScoring: io.optional(io.boolean()),
  }),
  result: ioSeason,
} satisfies TEndpointDef

export const SeasonUpdateDef = {
  path: '/SeasonUpdate',
  payload: io.object({
    seasonId: io.string(),
    name: io.string(),
    isHidden: io.optional(io.boolean()),
    signUpOpen: io.boolean(),
    finalResults: io.optional(
      io.array(
        io.object({
          teamId: io.string(),
          position: io.optional(io.null(io.number())),
        })
      )
    ),
  }),
  result: ioSeason,
} satisfies TEndpointDef
