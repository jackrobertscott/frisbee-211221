import {authPoint} from '@shared/auth/authAccess'
import {ioReport} from '@shared/schemas/ioReport'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io, TypeIoValue} from '@shared/torva'

export const ioReportSearchRow = io.object({
  report: ioReport,
  fixtureTitle: io.string(),
  teamName: io.string(),
  teamColor: io.optional(io.string()),
  againstName: io.string(),
  againstColor: io.optional(io.string()),
  submitterName: io.string(),
})

export type TReportSearchRow = TypeIoValue<typeof ioReportSearchRow>

export const ReportCreateDef = {
  access: authPoint.reportWrite,
  path: '/ReportCreate',
  payload: io.object({
    teamId: io.string(),
    againstTeamId: io.string(),
    fixtureId: io.string(),
    scoreFor: io.number(),
    scoreAgainst: io.number(),
    mvpMale: io.optional(io.string()),
    mvpFemale: io.optional(io.string()),
    mvpMale2: io.optional(io.string()),
    mvpFemale2: io.optional(io.string()),
    spirit: io.optional(io.number()),
    spiritComment: io.string().emptyok(),
    spiritP1: io.optional(io.number()), // Rules Knowledge and Use
    spiritP2: io.optional(io.number()), // Fouls and Body Contact
    spiritP3: io.optional(io.number()), // Fair-Mindedness
    spiritP4: io.optional(io.number()), // Attitude and Self-Control
    spiritP5: io.optional(io.number()), // Communication
  }),
  result: ioReport,
} satisfies TEndpointDef

export const ReportUpdateDef = {
  access: authPoint.reportManage,
  path: '/ReportUpdate',
  payload: io.object({
    reportId: io.string(),
    scoreFor: io.number(),
    scoreAgainst: io.number(),
    mvpMale: io.optional(io.string()),
    mvpFemale: io.optional(io.string()),
    mvpMale2: io.optional(io.string()),
    mvpFemale2: io.optional(io.string()),
    spirit: io.optional(io.number()),
    spiritComment: io.string().emptyok(),
    spiritP1: io.optional(io.number()),
    spiritP2: io.optional(io.number()),
    spiritP3: io.optional(io.number()),
    spiritP4: io.optional(io.number()),
    spiritP5: io.optional(io.number()),
  }),
  result: ioReport,
} satisfies TEndpointDef

export const ReportDeleteDef = {
  access: authPoint.reportManage,
  path: '/ReportDelete',
  payload: io.object({
    reportId: io.string(),
  }),
} satisfies TEndpointDef

export const ReportMissingListDef = {
  access: authPoint.reportManage,
  path: '/ReportMissingList',
  payload: io.object({
    seasonId: io.string(),
  }),
  result: io.array(
    io.object({
      title: io.string(),
      fixtureId: io.string(),
      date: io.date(),
      missingTeams: io.array(
        io.object({
          id: io.string(),
          name: io.string(),
          color: io.optional(io.string()),
          againstId: io.optional(io.string()),
          againstName: io.optional(io.string()),
        })
      ),
    })
  ),
} satisfies TEndpointDef
