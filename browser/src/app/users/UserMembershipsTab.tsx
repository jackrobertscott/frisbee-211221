import {TMember} from '@shared/schemas/ioMember'
import {compareSeasonNames} from '@shared/utils/seasonName'
import {Badge, DataTable, EmptyState, Text} from '@ui'
import {Users} from 'lucide-react'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$FeatureDashboardUserMembershipsLoad} from '../../endpoints/Feature'
import {Loading, TeamName} from '../shared'

/** A user's team memberships across every season (one user's list, not paged). */
export function UserMembershipsTab({userId}: {userId: string}) {
  const $memberList = useEndpoint($FeatureDashboardUserMembershipsLoad)
  const state = useLoad(() => $memberList.fetch({userId}), [userId])
  if (!state.data) {
    if (state.failed)
      return (
        <EmptyState
          title="Couldn’t load teams"
          description="Close the dialog and try again."
        />
      )
    return <Loading />
  }
  const {members, seasons, teams} = state.data
  const seasonName = (m: TMember) =>
    seasons.find((s) => s.id === m.seasonId)?.name ?? ''
  const team = (m: TMember) => teams.find((t) => t.id === m.teamId)
  const rows = members.slice().sort((a, b) => {
    const seasonDiff = compareSeasonNames(seasonName(a), seasonName(b))
    if (seasonDiff) return seasonDiff
    return (team(a)?.name ?? '').localeCompare(team(b)?.name ?? '')
  })
  if (!rows.length)
    return (
      <EmptyState
        icon={<Users />}
        title="No teams"
        description="This user hasn’t joined a team in any season."
      />
    )
  return (
    <DataTable<TMember>
      aria-label="Team memberships"
      rowKey={(m) => m.id}
      rows={rows}
      sortRows={false}
      columns={[
        {
          key: 'team',
          header: 'Team',
          render: (m) => {
            const t = team(m)
            return t ? (
              <TeamName team={t} />
            ) : (
              <Text as="span" size="sm" tone="tertiary">
                [unknown]
              </Text>
            )
          },
        },
        {
          key: 'season',
          header: 'Season',
          nowrap: true,
          render: (m) => seasonName(m) || '[unknown]',
        },
        {
          key: 'status',
          header: 'Status',
          render: (m) =>
            m.pending ? (
              <Badge size="sm" tone="warning" variant="outline">
                Pending
              </Badge>
            ) : m.captain ? (
              <Badge size="sm" tone="info">
                Captain
              </Badge>
            ) : (
              <Badge size="sm">Member</Badge>
            ),
        },
      ]}
    />
  )
}
