import {authPoint} from '@shared/auth/authAccess'
import {ioFixture} from '@shared/schemas/ioFixture'
import {ioReport} from '@shared/schemas/ioReport'
import {ioTeam} from '@shared/schemas/ioTeam'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io, TypeIoValue} from '@shared/torva'

export const ioReportSearchRow = io.object({
  report: ioReport,
  fixtureTitle: ioFixture.shape.title,
  teamName: ioTeam.shape.name,
  teamColor: io.optional(ioTeam.shape.color),
  againstName: ioTeam.shape.name,
  againstColor: io.optional(ioTeam.shape.color),
  submitterName: io.string(),
})

export type TReportSearchRow = TypeIoValue<typeof ioReportSearchRow>

export const ReportCreateDef = {
  access: authPoint.reportWrite,
  path: '/ReportCreate',
  payload: ioReport.pick([
    'teamId',
    'teamAgainstId',
    'fixtureId',
    'scoreFor',
    'scoreAgainst',
    'mvpMale',
    'mvpFemale',
    'mvpMale2',
    'mvpFemale2',
    'spirit',
    'spiritComment',
    'spiritP1',
    'spiritP2',
    'spiritP3',
    'spiritP4',
    'spiritP5',
  ]),
  result: ioReport,
} satisfies TEndpointDef

export type TReportCreatePayload = TypeIoValue<typeof ReportCreateDef.payload>

export const ReportUpdateDef = {
  access: authPoint.reportManage,
  path: '/ReportUpdate',
  payload: ioReport.pick([
    'scoreFor',
    'scoreAgainst',
    'mvpMale',
    'mvpFemale',
    'mvpMale2',
    'mvpFemale2',
    'spirit',
    'spiritComment',
    'spiritP1',
    'spiritP2',
    'spiritP3',
    'spiritP4',
    'spiritP5',
  ]).extend({reportId: ioReport.shape.id}),
  result: ioReport,
} satisfies TEndpointDef

export type TReportUpdatePayload = TypeIoValue<typeof ReportUpdateDef.payload>

export const ReportDeleteDef = {
  access: authPoint.reportManage,
  path: '/ReportDelete',
  payload: io.object({
    reportId: ioReport.shape.id,
  }),
} satisfies TEndpointDef

export const ReportMissingListDef = {
  access: authPoint.reportManage,
  path: '/ReportMissingList',
  payload: io.object({
    seasonId: ioFixture.shape.seasonId,
  }),
  result: io.array(
    io.object({
      title: ioFixture.shape.title,
      fixtureId: ioFixture.shape.id,
      date: ioFixture.shape.date,
      missingTeams: io.array(
        io.object({
          id: ioTeam.shape.id,
          name: ioTeam.shape.name,
          color: io.optional(ioTeam.shape.color),
          againstId: io.optional(ioTeam.shape.id),
          againstName: io.optional(ioTeam.shape.name),
        }),
      ),
    }),
  ),
} satisfies TEndpointDef
