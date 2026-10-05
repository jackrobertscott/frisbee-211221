import {TTeam} from '@shared/schemas/ioTeam'
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  SearchInput,
  Stack,
  Text,
  toast,
} from '@ui'
import {Hourglass, Plus, Search, Users} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$FeatureTeamSetupLoad} from '../../endpoints/Feature'
import {$MemberRequestCreate} from '../../endpoints/Member'
import {Loading, TeamName, useDebounced} from '../shared'
import {TeamCurrentCreateDialog} from '../team/TeamDialogs'
import '../team/team.css'

/** For signed-in players without a team: request to join one, or start a new team. */
export function JoinTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const auth = useAuth()
  const $teamSetupLoad = useEndpoint($FeatureTeamSetupLoad)
  const $memberRequest = useEndpoint($MemberRequestCreate)
  const [query, querySet] = useState('')
  const search = useDebounced(query)
  const [creating, creatingSet] = useState(false)
  const [requested, requestedSet] = useState<TTeam>()
  const seasonId = auth.season?.id
  useEffect(() => {
    if (open) querySet('')
  }, [open])
  const list = useLoad(
    () =>
      open && seasonId
        ? $teamSetupLoad.fetch({seasonId, search})
        : Promise.resolve(undefined),
    [open, seasonId, search],
  )
  const data = list.data
  const pendingTeam = data?.pendingTeam

  return (
    <>
      <Dialog
        open={open && !creating}
        onOpenChange={onOpenChange}
        icon={<Users />}
        title="Join a team"
        description={
          auth.season &&
          `Find your team in ${auth.season.name}. The team captain approves requests.`
        }
        footer={
          pendingTeam ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              {auth.season && !auth.season.signUpOpen && (
                <Text size="xs" tone="tertiary" className="fr-footer-left">
                  Team sign-ups are closed for this season.
                </Text>
              )}
              <Button leading={<Plus />} onClick={() => creatingSet(true)}>
                Create new team
              </Button>
            </>
          )
        }
      >
        {data === undefined ? (
          <Loading label="Loading teams" />
        ) : pendingTeam ? (
          <EmptyState
            icon={<Hourglass />}
            title="Request pending"
            description={
              <>
                You have requested to join <b>{pendingTeam.name}</b>. Please wait
                while the team captain responds to your request.
              </>
            }
          />
        ) : (
          <Stack gap={3}>
            <SearchInput
              placeholder="Search teams"
              aria-label="Search teams"
              value={query}
              onChange={(e) => querySet(e.target.value)}
              onClear={() => querySet('')}
              autoFocus
            />
            {data.teams.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No teams found"
                description={search ? 'Try another name.' : undefined}
                bordered
              />
            ) : (
              <ul className="fr-pick-list" aria-busy={list.loading || undefined}>
                {data.teams.map((team) => (
                  <li key={team.id}>
                    <TeamName team={team} size="md" />
                    <Text as="span" size="xs" tone="tertiary">
                      {team.division !== undefined ? `Div ${team.division}` : ''}
                    </Text>
                    <Button size="xs" onClick={() => requestedSet(team)}>
                      Request to join
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!requested}
        onOpenChange={(o) => !o && requestedSet(undefined)}
        icon={<Users />}
        title={`Join ${requested?.name ?? 'team'}?`}
        description={`Are you sure you wish to join ${requested?.name ?? 'this team'}? The team captain will need to approve your request.`}
        confirmLabel="Join team"
        onConfirm={() => {
          if (!requested) return
          return $memberRequest
            .fetch(requested.id)
            .then(() => {
              toast.success(
                'Request successfully created. Please wait while the captain approves the request.',
              )
              querySet('')
              list.reload()
            })
        }}
      />
      <TeamCurrentCreateDialog
        open={open && creating}
        onOpenChange={creatingSet}
        onCreated={(team) => {
          auth.teamSet(team)
          toast.success('Team created.')
          creatingSet(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}
