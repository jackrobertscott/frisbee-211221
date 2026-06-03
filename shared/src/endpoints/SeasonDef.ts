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
  payload: ioSeason.pick([
    'name',
    'signUpOpen',
    'useOfficialScoring',
    'genderDivision',
  ]),
  result: ioSeason,
} satisfies TEndpointDef

export const SeasonUpdateDef = {
  access: authPoint.seasonManage,
  path: '/SeasonUpdate',
  payload: ioSeason
    .pick(['name', 'isHidden', 'signUpOpen', 'genderDivision', 'finalResults'])
    .extend({seasonId: ioSeason.shape.id}),
  result: ioSeason,
} satisfies TEndpointDef

export const SeasonDeleteStatusDef = {
  access: authPoint.seasonManage,
  path: '/SeasonDeleteStatus',
  payload: io.object({
    seasonId: ioSeason.shape.id,
  }),
  result: io.object({
    canDelete: io.boolean(),
  }),
} satisfies TEndpointDef

export const SeasonDeleteDef = {
  access: authPoint.seasonManage,
  path: '/SeasonDelete',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    password: io.string(),
  }),
} satisfies TEndpointDef
