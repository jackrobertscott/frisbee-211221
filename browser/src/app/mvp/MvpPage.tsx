import {authPoint} from '@shared/auth/authAccess'
import {TFeatureMvpRow} from '@shared/endpoints/FeatureDef'
import {getSeasonMvpSlots} from '@shared/utils/seasonGenderDivision'
import {Alert, Card, CardHeader, DataTable, Text} from '@ui'
import {Award, Info} from 'lucide-react'
import {useEffect} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {useLoad} from '../../core/hooks/useLoad'
import {$FeatureDashboardMvpLoad} from '../../core/endpoints/Feature'
import {navigate} from '../../core/router/navigate'
import {Loading} from '../common/Loading'
import {useShell} from '../shell/ShellProvider'

/** Admin MVP tallies, one table per gender slot (server-ordered by points). */
export function MvpPage() {
  const auth = useAuth()
  const shell = useShell()
  const season = auth.season
  const allowed = auth.can(authPoint.reportManage)
  const $load = useEndpoint($FeatureDashboardMvpLoad)
  const slots = getSeasonMvpSlots(season)

  useEffect(() => {
    if (!allowed) navigate('/')
  }, [allowed])

  const {data, failed, reload} = useLoad(
    () =>
      allowed && season
        ? $load.fetch({seasonId: season.id})
        : Promise.resolve(undefined),
    [allowed, season?.id, shell.version],
  )

  if (!season) return null
  if (!data)
    return <Loading label="Loading MVP points" failed={failed} onRetry={reload} />

  return (
    <div className="fr-page">
      {season.useOfficialScoring && (
        <Alert tone="info" icon={<Info />}>
          MVP 1st place = <b>5 points</b> · MVP 2nd place = <b>3 points</b>
        </Alert>
      )}
      <div className="fr-grid-2 fr-grid-2--wide">
        {slots.male && (
          <MvpCard title="Male MVP points" rows={data.rows.filter((r) => r.gender === 0)} />
        )}
        {slots.female && (
          <MvpCard title="Female MVP points" rows={data.rows.filter((r) => r.gender === 1)} />
        )}
      </div>
    </div>
  )
}

function MvpCard({title, rows}: {title: string; rows: TFeatureMvpRow[]}) {
  return (
    <Card>
      <CardHeader
        icon={<Award />}
        title={title}
        description={`${rows.length} player${rows.length === 1 ? '' : 's'} with votes`}
        divider
      />
      <DataTable<TFeatureMvpRow>
        aria-label={title}
        bordered={false}
        density="compact"
        rowKey={(r) => r.userId}
        rows={rows}
        empty={
          <Text size="sm" tone="tertiary">
            No votes yet.
          </Text>
        }
        columns={[
          {
            key: 'userName',
            header: 'Player',
            nowrap: true,
            render: (r) => (
              <Text as="span" size="sm" weight="medium">
                {r.userName}
              </Text>
            ),
          },
          {
            key: 'division',
            header: 'Div',
            align: 'right',
            hideBelow: 'sm',
            render: (r) => r.division ?? '—',
          },
          {
            key: 'teamName',
            header: 'Team',
            render: (r) => r.teamName ?? '—',
          },
          {
            key: 'votes',
            header: 'Points',
            align: 'right',
            render: (r) => <b className="fr-num">{r.votes}</b>,
          },
        ]}
      />
    </Card>
  )
}
