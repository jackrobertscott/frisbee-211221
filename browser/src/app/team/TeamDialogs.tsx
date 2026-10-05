import {TTeam} from '@shared/schemas/ioTeam'
import {
  Alert,
  Button,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  toast,
} from '@ui'
import {Plus, Trash2} from 'lucide-react'
import {type FormEvent, useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {
  $TeamCreate,
  $TeamCurrentCreate,
  $TeamDelete,
  $TeamUpdate,
} from '../../endpoints/Team'
import {fmtDateTime, TeamName} from '../shared'
import {
  hasTeamFormErrors,
  TeamFormFields,
  teamFormFrom,
  type TTeamFormValue,
} from './TeamForm'
import {TeamMembers} from './TeamMembers'

const sameForm = (a: TTeamFormValue, b: TTeamFormValue) =>
  a.name === b.name &&
  a.color === b.color &&
  a.phone === b.phone &&
  a.email === b.email &&
  a.division === b.division

/** Read-only team card for visitors and players. */
export function TeamViewDialog({
  team,
  onClose,
}: {
  team?: TTeam
  onClose: () => void
}) {
  return (
    <Dialog
      open={!!team}
      onOpenChange={(o) => !o && onClose()}
      title={team && <TeamName team={team} size="md" />}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {team && (
        <DescriptionList
          items={[
            {term: 'Name', detail: team.name},
            {term: 'Phone', detail: team.phone || '—'},
            {term: 'Email', detail: team.email || '—'},
            {
              term: 'Division',
              detail: team.division !== undefined ? `Division ${team.division}` : '—',
            },
          ]}
        />
      )}
    </Dialog>
  )
}

/** Admin team view: edit details (incl. division), manage the roster, delete. */
export function TeamAdminDialog({
  team,
  onClose,
  onSaved,
  onDeleted,
}: {
  team?: TTeam
  onClose: () => void
  onSaved: (team: TTeam) => void
  onDeleted: () => void
}) {
  const $teamUpdate = useEndpoint($TeamUpdate)
  const $teamDelete = useEndpoint($TeamDelete)
  const [tab, tabSet] = useState('details')
  const [form, formSet] = useState(() => teamFormFrom(team))
  const [deleting, deletingSet] = useState(false)
  const teamId = team?.id
  useEffect(() => tabSet('details'), [teamId])
  useEffect(() => formSet(teamFormFrom(team)), [team])
  const isDifferent = !!team && !sameForm(form, teamFormFrom(team))
  const [checked, checkedSet] = useState(false)
  useEffect(() => checkedSet(false), [teamId])
  const save = (e?: FormEvent) => {
    e?.preventDefault()
    if (!team || !isDifferent) return
    checkedSet(true)
    if (hasTeamFormErrors(form)) return
    $teamUpdate
      .fetch({
        teamId: team.id,
        name: form.name,
        color: form.color,
        phone: form.phone,
        email: form.email,
        division: form.division,
      })
      .then((next) => {
        toast.success('Team saved.')
        onSaved(next)
      })
      .catch(() => undefined)
  }
  return (
    <>
      <Dialog
        open={!!team}
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={team && <TeamName team={team} size="md" />}
        description={
          team &&
          (team.division !== undefined ? `Division ${team.division}` : 'No division')
        }
        footer={
          <>
            <Button
              variant="danger"
              leading={<Trash2 />}
              onClick={() => deletingSet(true)}
              className="fr-footer-left"
            >
              Delete
            </Button>
            <Button onClick={onClose}>Close</Button>
            {tab === 'details' && (
              <Button
                variant="primary"
                disabled={!isDifferent}
                loading={$teamUpdate.loading}
                onClick={() => save()}
              >
                Save changes
              </Button>
            )}
          </>
        }
      >
        {team && (
          <Tabs value={tab} onValueChange={tabSet}>
            <TabList aria-label="Team">
              <Tab value="details">View &amp; edit</Tab>
              <Tab value="members">Team members</Tab>
            </TabList>
            <TabPanel value="details">
              <form onSubmit={save} noValidate>
                <Stack gap={5}>
                  <TeamFormFields
                    value={form}
                    onChange={formSet}
                    division
                    showErrors={checked}
                  />
                  <DescriptionList
                    items={[
                      {term: 'Created', detail: <span className="fr-nowrap">{fmtDateTime(team.createdOn)}</span>},
                      {term: 'Last updated', detail: <span className="fr-nowrap">{fmtDateTime(team.updatedOn)}</span>},
                    ]}
                  />
                  <button type="submit" hidden />
                </Stack>
              </form>
            </TabPanel>
            <TabPanel value="members">
              <TeamMembers team={team} />
            </TabPanel>
          </Tabs>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={deletingSet}
        tone="danger"
        icon={<Trash2 />}
        title={`Delete ${team?.name ?? 'team'}?`}
        description="Are you sure you wish to permanently delete this team?"
        confirmLabel="Delete team"
        confirmVariant="danger"
        onConfirm={() => {
          if (!team) return
          return $teamDelete
            .fetch({teamId: team.id})
            .then(() => {
              toast(`${team.name} deleted.`)
              onDeleted()
            })
        }}
      />
    </>
  )
}

/** Admin: add a team to the current season. */
export function TeamCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (team: TTeam) => void
}) {
  const auth = useAuth()
  const $teamCreate = useEndpoint($TeamCreate)
  const [form, formSet] = useState(() => teamFormFrom())
  const [checked, checkedSet] = useState(false)
  useEffect(() => {
    if (!open) return
    formSet(teamFormFrom())
    checkedSet(false)
  }, [open])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const seasonId = auth.season?.id
    if (!seasonId || $teamCreate.loading) return
    checkedSet(true)
    if (hasTeamFormErrors(form)) return
    $teamCreate
      .fetch({
        seasonId,
        name: form.name,
        color: form.color,
        phone: form.phone,
        email: form.email,
      })
      .then((team) => {
        toast.success(`${team.name} created.`)
        onCreated(team)
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Plus />}
      title="New team"
      description={auth.season && `Adds a team to ${auth.season.name}.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={$teamCreate.loading}
            onClick={() => submit()}
          >
            Create team
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <TeamFormFields
          value={form}
          onChange={formSet}
          autoFocus
          showErrors={checked}
        />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** Player: start a new team in the current season and become its captain. */
export function TeamCurrentCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (team: TTeam) => void
}) {
  const auth = useAuth()
  const $create = useEndpoint($TeamCurrentCreate)
  const [form, formSet] = useState(() => teamFormFrom())
  const [checked, checkedSet] = useState(false)
  useEffect(() => {
    if (!open) return
    formSet(teamFormFrom())
    checkedSet(false)
  }, [open])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const seasonId = auth.season?.id
    if (!seasonId || $create.loading) return
    checkedSet(true)
    if (hasTeamFormErrors(form, false)) return
    $create
      .fetch({seasonId, name: form.name, color: form.color})
      .then(({team}) => onCreated(team))
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Plus />}
      title="New team"
      description="You’ll be the captain and can add players afterwards."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={$create.loading} onClick={() => submit()}>
            Create team
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap={4}>
          {auth.season && !auth.season.signUpOpen && (
            <Alert tone="warning">
              Team sign-ups for {auth.season.name} are currently closed.
            </Alert>
          )}
          <TeamFormFields
            value={form}
            onChange={formSet}
            contact={false}
            autoFocus
            showErrors={checked}
          />
        </Stack>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
