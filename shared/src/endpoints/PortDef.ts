import {authPoint} from '@shared/auth/authAccess'
import {ioSeason} from '@shared/schemas/ioSeason'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const PortImportDef = {
  access: authPoint.portManage,
  path: '/PortImport',
  multipart: true,
} satisfies TEndpointDef

export const PortExportDef = {
  access: authPoint.portManage,
  path: '/PortExport',
  payload: io.object({
    fileType: io.enum(['csv', 'json']),
  }),
  result: io.any(),
} satisfies TEndpointDef

export const PortGamedayImportDef = {
  access: authPoint.portManage,
  path: '/PortGamedayImport',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    username: io.string().trim(),
    password: io.string(),
    association: io.string().trim(),
    competition: io.string().trim(),
  }),
  result: io.object({
    rowsImported: io.number(),
    teamsCreated: io.number(),
    usersCreated: io.number(),
    membersCreated: io.number(),
  }),
} satisfies TEndpointDef

export const PortMockGenerateDef = {
  access: authPoint.portManage,
  path: '/PortMockGenerate',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    teams: io.number(),
    usersPerTeam: io.number(),
  }),
} satisfies TEndpointDef

export const PortDeleteAllMockDataDef = {
  access: authPoint.portManage,
  path: '/PortDeleteAllMockData',
} satisfies TEndpointDef
