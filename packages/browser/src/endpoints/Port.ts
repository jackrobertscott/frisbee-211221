import {PortExportDef, PortImportDef} from '@shared/endpoints/PortDef'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $PortImport = createEndpoint(PortImportDef)
/**
 *
 */
export const $PortExport = createEndpoint(PortExportDef)