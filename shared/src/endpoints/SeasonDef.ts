import {authPoint} from '@shared/auth/authAccess'
import {ioSeason} from '@shared/schemas/ioSeason'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const SeasonListDef = {
  path: '/SeasonList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
  }),
  result: io.array(ioSeason),
} satisfies TEndpointDef

export const SeasonCreateDef = {
  access: authPoint.seasonManage,
  path: '/SeasonCreate',
  payload: ioSeason.pick(['name', 'signUpOpen', 'useOfficialScoring']),
  result: ioSeason,
} satisfies TEndpointDef

export const SeasonUpdateDef = {
  access: authPoint.seasonManage,
  path: '/SeasonUpdate',
  payload: ioSeason
    .pick(['name', 'isHidden', 'signUpOpen', 'finalResults'])
    .extend({seasonId: ioSeason.shape.id}),
  result: ioSeason,
} satisfies TEndpointDef
