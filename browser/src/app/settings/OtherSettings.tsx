import {
  isSeasonGenderDivision,
  TSeasonGenderDivision,
} from '@shared/schemas/ioSeason'
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Stack,
  Switch,
  Text,
  toast,
} from '@ui'
import {KeyRound, Trash2, TriangleAlert} from 'lucide-react'
import {type FormEvent, useEffect, useState} from 'react'
import {SEASON_STORAGE_KEY} from '../../core/auth/authStorage'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {
  $SeasonDelete,
  $SeasonDeleteStatus,
  $SeasonUpdate,
} from '../../endpoints/Season'
import {$TeamCurrentUpdate} from '../../endpoints/Team'
import {$UserCurrentChangePassword} from '../../endpoints/User'
import {local} from '../../utils/local'
import {hasTeamFormErrors, TeamFormFields, teamFormFrom} from '../team/TeamForm'
import './settings.css'

const emptyPasswords = {oldPassword: '', newPassword: '', confirm: ''}

export function PasswordSettings() {
  const $changePassword = useEndpoint($UserCurrentChangePassword)
  const [form, formSet] = useState(emptyPasswords)
  const mismatch = !!form.confirm && form.confirm !== form.newPassword
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (mismatch || $changePassword.loading) return
    $changePassword
      .fetch({oldPassword: form.oldPassword, newPassword: form.newPassword})
      .then(() => {
        formSet(emptyPasswords)
        toast.success('Password changed.')
      })
      .catch(() => undefined)
  }
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap={4}>
        <Field label="Old password">
          <Input
            type="password"
            autoComplete="current-password"
            leading={<KeyRound />}
            value={form.oldPassword}
            onChange={(e) => formSet({...form, oldPassword: e.target.value})}
          />
        </Field>
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => formSet({...form, newPassword: e.target.value})}
          />
        </Field>
        <Field
          label="Confirm new password"
          error={mismatch ? 'The new passwords don’t match.' : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            invalid={mismatch}
            onChange={(e) => formSet({...form, confirm: e.target.value})}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          loading={$changePassword.loading}
          disabled={mismatch}
          className="fr-settings-save"
        >
          Change password
        </Button>
      </Stack>
    </form>
  )
}

/** Captain (or admin) edits their own team's public details. */
export function TeamSettings() {
  const auth = useAuth()
  const team = auth.current?.team
  const $teamUpdate = useEndpoint($TeamCurrentUpdate)
  const [form, formSet] = useState(() => teamFormFrom(team))
  const teamId = team?.id
  const [checked, checkedSet] = useState(false)
  useEffect(() => {
    formSet(teamFormFrom(team))
    checkedSet(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!team || $teamUpdate.loading) return
    checkedSet(true)
    if (hasTeamFormErrors(form)) return
    $teamUpdate
      .fetch({
        teamId: team.id,
        name: form.name,
        color: form.color,
        phone: form.phone,
        email: form.email,
      })
      .then((next) => {
        auth.teamSet(next)
        toast.success('Team updated.')
      })
      .catch(() => undefined)
  }
  if (!team) return null
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap={4}>
        <TeamFormFields value={form} onChange={formSet} showErrors={checked} />
        <Button
          type="submit"
          variant="primary"
          loading={$teamUpdate.loading}
          className="fr-settings-save"
        >
          Save
        </Button>
      </Stack>
    </form>
  )
}

const DIVISION_OPTIONS: Array<{value: TSeasonGenderDivision; label: string}> = [
  {value: 'mixed', label: 'Mixed'},
  {value: 'men', label: 'Men’s'},
  {value: 'women', label: 'Women’s'},
]

/** Admin settings for the selected season, plus deleting it. */
export function SeasonSettings() {
  const auth = useAuth()
  const season = auth.season
  const $updateSeason = useEndpoint($SeasonUpdate)
  const $deleteStatus = useEndpoint($SeasonDeleteStatus)
  const formFrom = () => ({
    name: season?.name ?? '',
    isHidden: !!season?.isHidden,
    signUpOpen: !!season?.signUpOpen,
    genderDivision: season?.genderDivision ?? ('mixed' as TSeasonGenderDivision),
  })
  const [form, formSet] = useState(formFrom)
  const [canDelete, canDeleteSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const seasonId = season?.id
  useEffect(() => {
    formSet(formFrom())
    canDeleteSet(false)
    if (!seasonId) return
    $deleteStatus
      .fetch({seasonId})
      .then((data) => canDeleteSet(data.canDelete))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])
  if (!season) return null
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if ($updateSeason.loading) return
    $updateSeason
      .fetch({
        seasonId: season.id,
        name: form.name,
        isHidden: form.isHidden,
        signUpOpen: form.signUpOpen,
        genderDivision: form.genderDivision,
      })
      .then((data) => {
        auth.seasonSet(data, true)
        toast.success('Season updated.')
      })
      .catch(() => undefined)
  }
  return (
    <Stack gap={6}>
      <form onSubmit={submit} noValidate>
        <Stack gap={4}>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => formSet({...form, name: e.target.value})}
              placeholder="e.g. Summer 2022"
            />
          </Field>
          <Switch
            checked={form.isHidden}
            onCheckedChange={(isHidden) => formSet({...form, isHidden})}
            label="Hide from dashboard"
            description="The season will not be shown in the dashboard dropdown menu."
            labelPosition="start"
          />
          <Switch
            checked={form.signUpOpen}
            onCheckedChange={(signUpOpen) => formSet({...form, signUpOpen})}
            label="Sign up open"
            description="Teams and players can sign up while this is active."
            labelPosition="start"
          />
          <Field label="Season type">
            <Select
              value={form.genderDivision}
              onValueChange={(v) =>
                v &&
                isSeasonGenderDivision(v) &&
                formSet({...form, genderDivision: v})
              }
              options={DIVISION_OPTIONS}
            />
          </Field>
          <Field
            label="Scoring system"
            description="Set when the season is created and can’t be changed."
          >
            <Input
              value={season.useOfficialScoring ? 'Official' : 'Simple'}
              readOnly
              disabled
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            loading={$updateSeason.loading}
            className="fr-settings-save"
          >
            Save
          </Button>
        </Stack>
      </form>
      {canDelete && (
        <div className="fr-danger-row">
          <div>
            <Text size="sm" weight="medium">
              Delete season
            </Text>
            <Text size="xs" tone="tertiary">
              Permanently removes {season.name} and everything in it.
            </Text>
          </div>
          <Button
            variant="danger"
            size="sm"
            leading={<Trash2 />}
            onClick={() => deletingSet(true)}
          >
            Delete season
          </Button>
        </div>
      )}
      <SeasonDeleteDialog
        open={deleting}
        onOpenChange={deletingSet}
        seasonId={season.id}
        seasonName={season.name}
      />
    </Stack>
  )
}

function SeasonDeleteDialog({
  open,
  onOpenChange,
  seasonId,
  seasonName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seasonId: string
  seasonName: string
}) {
  const $deleteSeason = useEndpoint($SeasonDelete)
  const [password, passwordSet] = useState('')
  useEffect(() => {
    if (open) passwordSet('')
  }, [open])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if ($deleteSeason.loading) return
    $deleteSeason
      .fetch({seasonId, password})
      .then(() => {
        toast.success('Season deleted.')
        local.remove(SEASON_STORAGE_KEY)
        window.location.href = '/'
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      icon={<TriangleAlert />}
      title={`Delete ${seasonName}?`}
      dismissable={!$deleteSeason.loading}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={$deleteSeason.loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={$deleteSeason.loading}
            onClick={() => submit()}
          >
            Delete season
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap={4}>
          <Alert tone="danger">
            This will permanently delete the season and its fixtures, teams,
            members, posts, and comments.
          </Alert>
          <Field label="Password" description="Enter your password to confirm.">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => passwordSet(e.target.value)}
              disabled={$deleteSeason.loading}
              autoFocus
            />
          </Field>
        </Stack>
      </form>
    </Dialog>
  )
}
