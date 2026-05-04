import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const PortImportDef = {
  path: '/PortImport',
  multipart: true,
} satisfies TEndpointDef

export const PortExportDef = {
  path: '/PortExport',
  payload: io.object({
    fileType: io.enum(['csv', 'json']),
  }),
  result: io.any(),
} satisfies TEndpointDef

export const PortMockGenerateDef = {
  path: '/PortMockGenerate',
  payload: io.object({
    seasonId: io.string().trim(),
    teams: io.number(),
    usersPerTeam: io.number(),
  }),
} satisfies TEndpointDef

export const PortDeleteAllMockDataDef = {
  path: '/PortDeleteAllMockData',
} satisfies TEndpointDef
