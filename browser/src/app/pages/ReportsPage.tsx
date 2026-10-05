import {authPoint} from '@shared/auth/authAccess'
import {TReportSearchRow} from '@shared/endpoints/ReportDef'
import {isReportMvpCompleteForSeason} from '@shared/utils/seasonGenderDivision'
import {Button, ConfirmDialog, DataTable, EmptyState, Text, Tooltip, toast} from '@ui'
import {Check, CircleAlert, FileText, Plus, Trash2, X} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$FeatureDashboardReportsLoad} from '../../endpoints/Feature'
import {$ReportCreate, $ReportDelete, $ReportUpdate} from '../../endpoints/Report'
import {go} from '../../utils/go'
import {MissingReportsButton} from '../report/MissingReports'
import {
  createReportCreatePayload,
  createReportUpdatePayload,
  reportSpiritTotal,
} from '../report/reportForm'
import {ReportFormDialog} from '../report/ReportFormDialog'
import {fmtShort, Loading, TeamName, Toolbar, useServerPaging} from '../shared'
import {useShell} from '../shell'

const MVP_STATUS = {
  complete: {icon: <Check />, label: 'All MVP votes given'},
  partial: {icon: <CircleAlert />, label: 'Some MVP votes missing'},
  empty: {icon: <X />, label: 'No MVP votes given'},
}

/** Admin list of score reports with server-side search + paging. */
export function ReportsPage() {
  const auth = useAuth()
  const shell = useShell()
  const season = auth.season
  const official = season?.useOfficialScoring === true
  const allowed = auth.can(authPoint.reportManage)
  const paging = useServerPaging()
  const $load = useEndpoint($FeatureDashboardReportsLoad)
  const $create = useEndpoint($ReportCreate)
  const $update = useEndpoint($ReportUpdate)
  const $delete = useEndpoint($ReportDelete)
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const [deleting, deletingSet] = useState(false)

  useEffect(() => {
    if (!allowed) go.to('/')
  }, [allowed])

  const {data, loading, failed, reload} = useLoad(
    () =>
      allowed && season
        ? $load.fetch({
            seasonId: season.id,
            search: paging.search,
            skip: paging.skip,
            limit: paging.limit,
          })
        : Promise.resolve(undefined),
    [allowed, season?.id, paging.search, paging.skip, paging.limit, shell.version],
  )

  const current = currentId
    ? data?.reports.find((r) => r.report.id === currentId)
    : undefined

  if (!season) return null
  if (!data)
    return <Loading label="Loading reports" failed={failed} onRetry={reload} />

  return (
    <div className="fr-page">
      <Toolbar
        search={paging.query}
        onSearch={paging.setQuery}
        placeholder="Search reports"
      >
        <MissingReportsButton seasonId={season.id} />
        <Button variant="primary" leading={<Plus />} onClick={() => creatingSet(true)}>
          Create report
        </Button>
      </Toolbar>

      <DataTable<TReportSearchRow>
        aria-label="Score reports"
        rowKey={(r) => r.report.id}
        rows={data.reports}
        loading={loading}
        onRowClick={(r) => currentIdSet(r.report.id)}
        empty={
          <EmptyState
            icon={<FileText />}
            title={paging.search ? 'No matching reports' : 'No reports yet'}
            description={
              paging.search
                ? 'Try a team, fixture or player name.'
                : 'Reports appear here as teams submit their scores.'
            }
          />
        }
        columns={[
          {
            key: 'fixture',
            header: 'Fixture',
            render: (r) => <span className="fr-nowrap">{r.fixtureTitle}</span>,
          },
          {
            key: 'by',
            header: 'By',
            render: (r) => <TeamName team={{name: r.teamName, color: r.teamColor}} />,
          },
          {
            key: 'against',
            header: 'Against',
            render: (r) => (
              <TeamName team={{name: r.againstName, color: r.againstColor}} />
            ),
          },
          {
            key: 'score',
            header: 'Score',
            align: 'center',
            render: (r) => (
              <span className="fr-num">
                {r.report.scoreFor}–{r.report.scoreAgainst}
              </span>
            ),
          },
          {
            key: 'spirit',
            header: 'Spirit',
            align: 'right',
            render: (r) => (
              <span className="fr-num">{reportSpiritTotal(r.report, official)}</span>
            ),
          },
          {
            key: 'mvps',
            header: 'MVPs',
            align: 'center',
            hideBelow: 'sm',
            render: (r) => {
              const status = isReportMvpCompleteForSeason(r.report, season, official)
              const s = MVP_STATUS[status]
              return (
                <Tooltip content={s.label}>
                  <span
                    className="fr-mvp-check"
                    data-done={status === 'complete' || undefined}
                    tabIndex={0}
                    aria-label={s.label}
                  >
                    {s.icon}
                  </span>
                </Tooltip>
              )
            },
          },
          {
            key: 'comment',
            header: 'Comment',
            hideBelow: 'lg',
            render: (r) =>
              r.report.spiritComment.trim() ? (
                <Text as="span" size="sm" tone="secondary" truncate className="fr-comment">
                  {r.report.spiritComment.trim()}
                </Text>
              ) : (
                <Text as="span" size="sm" tone="tertiary">
                  —
                </Text>
              ),
          },
          {
            key: 'submitter',
            header: 'Submitted by',
            hideBelow: 'md',
            render: (r) => <span className="fr-nowrap">{r.submitterName}</span>,
          },
          {
            key: 'created',
            header: 'Created',
            hideBelow: 'md',
            render: (r) => <span className="fr-num">{fmtShort(r.report.createdOn)}</span>,
          },
        ]}
      />
      {paging.pager(data.count)}

      <ReportFormDialog
        open={creating}
        onOpenChange={creatingSet}
        variant="dashboard"
        title="New report"
        initialFixtures={data.fixtures}
        initialTeams={data.teams}
        loading={$create.loading}
        onSubmit={(form) => {
          const payload = createReportCreatePayload(form, season)
          if (!payload) return
          $create
            .fetch(payload)
            .then(() => {
              toast.success('Report created.')
              creatingSet(false)
              paging.setQuery('')
              paging.setPage(1)
              shell.invalidate()
            })
            .catch(() => undefined)
        }}
      />

      <ReportFormDialog
        open={!!current}
        onOpenChange={(o) => !o && currentIdSet(undefined)}
        variant="dashboard"
        title="Edit report"
        initialData={current?.report}
        initialFixtures={data.fixtures}
        initialTeams={data.teams}
        submitter={current?.submitterName}
        loading={$update.loading}
        onDelete={() => deletingSet(true)}
        onSubmit={(form) => {
          if (!current) return
          const payload = createReportUpdatePayload(current.report.id, form, season)
          if (!payload) return
          $update
            .fetch(payload)
            .then(() => {
              toast.success('Report updated.')
              currentIdSet(undefined)
              shell.invalidate()
            })
            .catch(() => undefined)
        }}
      />

      <ConfirmDialog
        open={deleting && !!current}
        onOpenChange={deletingSet}
        tone="danger"
        icon={<Trash2 />}
        title="Delete report?"
        description="Are you sure you wish to permanently delete this report?"
        confirmLabel="Delete report"
        confirmVariant="danger"
        onConfirm={() => {
          if (!current) return
          return $delete
            .fetch({reportId: current.report.id})
            .then(() => {
              toast.success('Report deleted.')
              currentIdSet(undefined)
              shell.invalidate()
            })
        }}
      />
    </div>
  )
}
