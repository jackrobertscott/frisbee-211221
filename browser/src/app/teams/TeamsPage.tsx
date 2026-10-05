import {authPoint} from '@shared/auth/authAccess'
import {TEAM_LIST_SORT_KEYS, TTeamListSortKey} from '@shared/endpoints/TeamDef'
import {TTeam} from '@shared/schemas/ioTeam'
import {TSortDirection} from '@shared/utils/endpointDef'
import {Button, DataTable, EmptyState, Text, type SortState} from '@ui'
import {Plus, Users} from 'lucide-react'
import {useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {useLoad} from '../../core/hooks/useLoad'
import {$FeatureDashboardTeamsLoad} from '../../core/endpoints/Feature'
import {fmtShort} from '../common/format'
import {TeamName} from '../common/TeamName'
import {Toolbar} from '../common/Toolbar'
import {useServerPaging} from '../common/useServerPaging'
import {useShell} from '../shell/ShellProvider'
import {
  TeamAdminDialog,
  TeamCreateDialog,
  TeamViewDialog,
} from './TeamDialogs'

const isSortKey = (key: string): key is TTeamListSortKey =>
  TEAM_LIST_SORT_KEYS.some((k) => k === key)

export function TeamsPage() {
  const auth = useAuth()
  const shell = useShell()
  const canManage = auth.can(authPoint.teamDirectoryManage)
  const $teamList = useEndpoint($FeatureDashboardTeamsLoad)
  const paging = useServerPaging()
  const [sort, sortSet] = useState<{key: TTeamListSortKey; direction: TSortDirection}>(
    {key: 'division', direction: 'asc'},
  )
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const [currentTeam, currentTeamSet] = useState<TTeam>()
  const seasonId = auth.season?.id
  const list = useLoad(
    () =>
      seasonId
        ? $teamList.fetch({
            seasonId,
            search: paging.search,
            sortBy: sort.key,
            sortDirection: sort.direction,
            skip: paging.skip,
            limit: paging.limit,
          })
        : Promise.resolve({count: 0, teams: []}),
    [seasonId, paging.search, sort, paging.skip, paging.limit, shell.version],
  )
  const teams = list.data?.teams
  const current =
    currentTeam ?? (currentId ? teams?.find((t) => t.id === currentId) : undefined)
  const close = () => {
    currentIdSet(undefined)
    currentTeamSet(undefined)
  }

  const onSortChange = (next: SortState | null) => {
    const key = next?.key ?? sort.key
    if (!isSortKey(key)) return
    sortSet(
      key === sort.key
        ? {key, direction: sort.direction === 'asc' ? 'desc' : 'asc'}
        : {key, direction: key === 'createdOn' ? 'desc' : 'asc'},
    )
    paging.setPage(1)
  }

  return (
    <div className="fr-page">
      <Toolbar
        search={paging.query}
        onSearch={paging.setQuery}
        placeholder="Search teams"
      >
        {canManage && (
          <Button
            variant="primary"
            leading={<Plus />}
            onClick={() => creatingSet(true)}
          >
            Create team
          </Button>
        )}
      </Toolbar>
      <DataTable<TTeam>
        aria-label="Teams"
        rowKey={(t) => t.id}
        rows={teams ?? []}
        loading={list.loading}
        sort={sort}
        onSortChange={onSortChange}
        sortRows={false}
        onRowClick={(t) => {
          currentIdSet(t.id)
          currentTeamSet(undefined)
        }}
        empty={
          <EmptyState
            icon={<Users />}
            title={
              list.loading
                ? 'Loading teams'
                : paging.search
                  ? 'No matching teams'
                  : 'No teams yet'
            }
            description={
              list.loading
                ? undefined
                : paging.search
                  ? 'Try another name.'
                  : 'Teams appear here once they sign up for the season.'
            }
          />
        }
        columns={[
          {
            key: 'name',
            header: 'Team',
            sortable: true,
            render: (t) => <TeamName team={t} />,
          },
          {
            key: 'division',
            header: 'Division',
            sortable: true,
            nowrap: true,
            render: (t) =>
              t.division !== undefined ? (
                `Division ${t.division}`
              ) : (
                <Text as="span" size="sm" tone="tertiary">
                  Unassigned
                </Text>
              ),
          },
          {
            key: 'phone',
            header: 'Phone',
            sortable: true,
            hideBelow: 'md',
            render: (t) => <span className="fr-num">{t.phone || '—'}</span>,
          },
          {
            key: 'email',
            header: 'Email',
            sortable: true,
            hideBelow: 'lg',
            render: (t) => t.email || '—',
          },
          {
            key: 'createdOn',
            header: 'Created',
            sortable: true,
            hideBelow: 'md',
            render: (t) => <span className="fr-num">{fmtShort(t.createdOn)}</span>,
          },
        ]}
      />
      {paging.pager(list.data?.count ?? 0)}
      {canManage ? (
        <TeamAdminDialog
          team={current}
          onClose={close}
          onSaved={(team) => {
            currentTeamSet(team)
            currentIdSet(team.id)
            list.set((data) =>
              data && {
                ...data,
                teams: data.teams.map((t) => (t.id === team.id ? team : t)),
              },
            )
            list.reload()
          }}
          onDeleted={() => {
            close()
            list.reload()
          }}
        />
      ) : (
        <TeamViewDialog team={current} onClose={close} />
      )}
      {canManage && (
        <TeamCreateDialog
          open={creating}
          onOpenChange={creatingSet}
          onCreated={(team) => {
            creatingSet(false)
            currentIdSet(team.id)
            currentTeamSet(team)
            const reset = paging.query !== '' || paging.page !== 1
            paging.setQuery('')
            paging.setPage(1)
            if (!reset) list.reload()
          }}
        />
      )}
    </div>
  )
}
