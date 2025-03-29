import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

export const PortImportDef = {
  path: '/PortImport',
  multipart: true,
} satisfies TEndpointDef

export const PortExportDef = {
  path: '/PortExport',
  result: io.object({
    email: io.string(),
  }),
} satisfies TEndpointDef