import {
  PortDeleteAllMockDataDef,
  PortExportDef,
  PortGamedayImportDef,
  PortGamedayImportLoadDef,
  PortGamedayImportSaveDef,
  PortImportDef,
  PortMockGenerateDef,
} from '@shared/endpoints/PortDef'
import {createEndpoint} from '../utils/endpoints'

export const $PortImport = createEndpoint(PortImportDef)

export const $PortGamedayImportLoad = createEndpoint(PortGamedayImportLoadDef)

export const $PortGamedayImportSave = createEndpoint(PortGamedayImportSaveDef)

export const $PortGamedayImport = createEndpoint(PortGamedayImportDef)

export const $PortExport = createEndpoint(PortExportDef)

export const $PortMockGenerate = createEndpoint(PortMockGenerateDef)

export const $PortDeleteAllMockData = createEndpoint(PortDeleteAllMockDataDef)
