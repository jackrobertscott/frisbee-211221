import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {createEndpoint} from '../utils/endpoints'

export const $PortImport = createEndpoint(PortImportDef)

export const $PortExport = createEndpoint(PortExportDef)

export const $PortMockGenerate = createEndpoint(PortMockGenerateDef)

export const $PortDeleteAllMockData = createEndpoint(PortDeleteAllMockDataDef)
