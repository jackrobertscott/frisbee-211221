import {authPoint} from '@shared/auth/authAccess'
import {
  TFeatureSortDirection,
  TFeatureSpiritRow,
  TFeatureSpiritSortKey,
} from '@shared/endpoints/FeatureDef'
import {Badge, Card, CardHeader, DataTable, type SortState, Text} from '@ui'
import {HeartHandshake} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$FeatureDashboardSpiritLoad} from '../../endpoints/Feature'
import {go} from '../../utils/go'
import {Loading, TeamName} from '../shared'
import {useShell} from '../shell'

const SORT_KEYS: readonly TFeatureSpiritSortKey[] = [
  'team',
  'division',
  'receivedSpirit',
  'receivedReports',
  'receivedAverage',
  'adjustedReceivedAverage',
  'allocatedSpirit',
  'allocatedReports',
  'allocatedAverage',
  'adjustedAllocatedAverage',
  'averageDifference',
  'adjustedDifference',
]

const isSortKey = (key: string): key is TFeatureSpiritSortKey =>
  SORT_KEYS.some((k) => k === key)

const defaultDirection = (key: TFeatureSpiritSortKey): TFeatureSortDirection =>
  key === 'team' || key === 'division' ? 'asc' : 'desc'

const averageFormatter = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2})
const displayValue = (value: number) => (Math.abs(value) < 0.005 ? 0 : value)
const formatAverage = (value: number) => averageFormatter.format(displayValue(value))

/** Highlights differences of more than a point either way. */
function Diff({value}: {value: number}) {
  const v = displayValue(value)
  const label = `${v > 0 ? '+' : ''}${formatAverage(v)}`
  if (Math.abs(v) <= 1) return <span className="fr-num">{label}</span>
  return (
    <Badge size="sm" tone={v > 0 ? 'success' : 'info'}>
      {label}
    </Badge>
  )
}

/** Admin spirit table; sorting happens on the server. */
export function SpiritPage() {
  const auth = useAuth()
  const shell = useShell()
  const season = auth.season
  const allowed = auth.can(authPoint.reportManage)
  const official = season?.useOfficialScoring === true
  const $load = useEndpoint($FeatureDashboardSpiritLoad)
  const [sortBy, sortBySet] = useState<TFeatureSpiritSortKey>('adjustedReceivedAverage')
  const [sortDirection, sortDirectionSet] = useState<TFeatureSortDirection>('desc')

  useEffect(() => {
    if (!allowed) go.to('/')
  }, [allowed])

  const {data, loading, failed, reload} = useLoad(
    () =>
      allowed && season
        ? $load.fetch({seasonId: season.id, sortBy, sortDirection})
        : Promise.resolve(undefined),
    [allowed, season?.id, sortBy, sortDirection, shell.version],
  )

  const onSortChange = (next: SortState | null) => {
    // The table cycles asc → desc → off; here a column is always sorted.
    const key = next?.key ?? sortBy
    if (!isSortKey(key)) return
    if (key !== sortBy) {
      sortBySet(key)
      sortDirectionSet(defaultDirection(key))
      return
    }
    sortDirectionSet((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  if (!season) return null
  if (!data)
    return (
      <Loading label="Loading spirit scores" failed={failed} onRetry={reload} />
    )

  return (
    <div className="fr-page">
      <Card>
        <CardHeader
          icon={<HeartHandshake />}
          title="Team spirit scores"
          description={
            official
              ? 'Official scoring · five categories, 0–20 per game'
              : 'Simple scoring · 0–4 per game'
          }
          divider
        />
        <DataTable<TFeatureSpiritRow>
          aria-label="Team spirit scores"
          bordered={false}
          density="compact"
          rowKey={(r) => r.team.id}
          rows={data.rows}
          loading={loading}
          sort={{key: sortBy, direction: sortDirection}}
          onSortChange={onSortChange}
          sortRows={false}
          empty={
            <Text size="sm" tone="tertiary">
              No teams this season.
            </Text>
          }
          columns={[
            {key: 'team', header: 'Team', sortable: true, render: (r) => <TeamName team={r.team} wrap="narrow" />},
            {
              key: 'division',
              header: 'Div',
              sortable: true,
              hideBelow: 'sm',
              render: (r) => r.team.division ?? '—',
            },
            {key: 'receivedSpirit', header: 'Pts got', align: 'right', sortable: true, hideBelow: 'lg'},
            {key: 'receivedReports', header: 'Rpts got', align: 'right', sortable: true, hideBelow: 'lg'},
            {
              key: 'receivedAverage',
              header: 'Avg got',
              align: 'right',
              sortable: true,
              render: (r) => <span className="fr-num">{formatAverage(r.receivedAverage)}</span>,
            },
            {
              key: 'adjustedReceivedAverage',
              header: 'Adj got',
              align: 'right',
              sortable: true,
              render: (r) => (
                <b className="fr-num">{formatAverage(r.adjustedReceivedAverage)}</b>
              ),
            },
            {key: 'allocatedSpirit', header: 'Pts sent', align: 'right', sortable: true, hideBelow: 'lg'},
            {key: 'allocatedReports', header: 'Rpts sent', align: 'right', sortable: true, hideBelow: 'lg'},
            {
              key: 'allocatedAverage',
              header: 'Avg sent',
              align: 'right',
              sortable: true,
              hideBelow: 'md',
              render: (r) => <span className="fr-num">{formatAverage(r.allocatedAverage)}</span>,
            },
            {
              key: 'adjustedAllocatedAverage',
              header: 'Adj sent',
              align: 'right',
              sortable: true,
              hideBelow: 'md',
              render: (r) => (
                <span className="fr-num">{formatAverage(r.adjustedAllocatedAverage)}</span>
              ),
            },
            {
              key: 'averageDifference',
              header: 'Avg diff',
              align: 'right',
              sortable: true,
              render: (r) => <Diff value={r.averageDifference} />,
            },
            {
              key: 'adjustedDifference',
              header: 'Adj diff',
              align: 'right',
              sortable: true,
              hideBelow: 'sm',
              render: (r) => <Diff value={r.adjustedDifference} />,
            },
          ]}
        />
        <div className="fr-card-foot">
          <Text size="xs" tone="tertiary">
            <b>Adjusted got</b> is the average spirit score received after correcting for
            how generous or harsh the reporting teams usually score. <b>Diff</b> is
            highlighted when it’s more than a point either way.
          </Text>
        </div>
      </Card>
    </div>
  )
}
