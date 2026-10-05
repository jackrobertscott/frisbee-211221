import {
  ReportCreateDef,
  ReportDeleteDef,
  ReportMissingListDef,
  ReportUpdateDef,
} from '@shared/endpoints/ReportDef'
import {createEndpoint} from './createEndpoint'

export const $ReportCreate = createEndpoint(ReportCreateDef)

export const $ReportUpdate = createEndpoint(ReportUpdateDef)

export const $ReportDelete = createEndpoint(ReportDeleteDef)

export const $ReportMissingList = createEndpoint(ReportMissingListDef)
