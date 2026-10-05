import {
  TGamedayImportConfigSafe,
  TGamedayImportRun,
} from '@shared/schemas/ioGamedayImport'
import {TSeason} from '@shared/schemas/ioSeason'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DatePicker,
  DescriptionList,
  Dialog,
  EmptyState,
  Field,
  Input,
  Spinner,
  Stack,
  Switch,
  Text,
  toast,
} from '@ui'
import {CircleAlert, CloudDownload, Inbox, Info, Settings2} from 'lucide-react'
import {type FormEvent, useEffect, useState} from 'react'
import {useEndpoint} from '../../core/useEndpoint'
import {fmtDate} from '../shared'
import {
  $PortGamedayImport,
  $PortGamedayImportSave,
} from '../../endpoints/Port'
import {
  fmtOptionalRunDate,
  fmtRunDate,
  fmtRunNumber,
  fmtRunStatus,
  fmtRunTime,
  fmtRunTrigger,
  withPickedDay,
} from './format'

export interface TGamedayState {
  config?: TGamedayImportConfigSafe
  runs: TGamedayImportRun[]
}

function RunStatus({status}: {status: TGamedayImportRun['status']}) {
  if (status === 'running')
    return (
      <Badge size="sm" icon={<Spinner size={10} />}>
        Running
      </Badge>
    )
  return (
    <Badge size="sm" tone={status === 'succeeded' ? 'success' : 'danger'} dot>
      {fmtRunStatus(status)}
    </Badge>
  )
}

export function GamedayRunsCard({
  state,
  loading,
  onOpenRun,
}: {
  state?: TGamedayState
  loading: boolean
  onOpenRun: (run: TGamedayImportRun) => void
}) {
  const config = state?.config
  const description = !config
    ? 'Imports run once GameDay settings are saved.'
    : config.scheduleEnabled
      ? `Scheduled import runs daily after ${fmtRunTime(config.scheduleStartOn)}${config.scheduleStartOn && config.scheduleEndOn ? ` (${fmtDate(config.scheduleStartOn)} – ${fmtDate(config.scheduleEndOn)})` : ''}.`
      : 'Imports run when triggered manually.'
  return (
    <Card>
      <CardHeader
        title="GameDay import history"
        description={description}
        divider
      />
      <DataTable<TGamedayImportRun>
        aria-label="GameDay import history"
        bordered={false}
        density="compact"
        loading={loading && !state}
        rowKey={(r) => r.id}
        rows={state?.runs ?? []}
        onRowClick={onOpenRun}
        empty={
          <EmptyState
            icon={<Inbox />}
            title="No imports yet"
            description="GameDay import runs will appear here."
          />
        }
        columns={[
          {
            key: 'startedOn',
            header: 'Started',
            render: (r) => <span className="fr-num">{fmtRunDate(r.startedOn)}</span>,
          },
          {key: 'trigger', header: 'Trigger', render: (r) => fmtRunTrigger(r.trigger)},
          {key: 'status', header: 'Status', render: (r) => <RunStatus status={r.status} />},
          {
            key: 'source',
            header: 'Source',
            hideBelow: 'lg',
            render: (r) => (
              <Text as="span" size="sm" tone="secondary" truncate>
                {r.association} / {r.competition}
              </Text>
            ),
          },
          {
            key: 'rows',
            header: 'Rows',
            align: 'right',
            hideBelow: 'sm',
            render: (r) => <span className="fr-num">{fmtRunNumber(r.rowsImported)}</span>,
          },
          {
            key: 'members',
            header: 'Members',
            align: 'right',
            hideBelow: 'sm',
            render: (r) => <span className="fr-num">{fmtRunNumber(r.membersCreated)}</span>,
          },
          {
            key: 'error',
            header: 'Error',
            hideBelow: 'md',
            render: (r) =>
              r.errorMessage ? (
                <Text as="span" size="sm" tone="danger" truncate>
                  {r.errorMessage}
                </Text>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </Card>
  )
}

export function GamedayRunDialog({
  run,
  onClose,
}: {
  run?: TGamedayImportRun
  onClose: () => void
}) {
  return (
    <Dialog
      open={!!run}
      onOpenChange={(o) => !o && onClose()}
      icon={run?.status === 'failed' ? <CircleAlert /> : <Info />}
      tone={run?.status === 'failed' ? 'danger' : 'neutral'}
      title="GameDay import run details"
      description={
        run &&
        `${fmtRunStatus(run.status)} — ${fmtRunTrigger(run.trigger)} import for ${run.association} / ${run.competition}.`
      }
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {run && (
        <DescriptionList
          className="fr-port-dl"
          items={[
            {term: 'Run ID', detail: <Text as="span" size="sm" mono>{run.id}</Text>},
            {term: 'Config ID', detail: <Text as="span" size="sm" mono>{run.configId}</Text>},
            {term: 'Started', detail: fmtRunDate(run.startedOn)},
            {term: 'Finished', detail: fmtOptionalRunDate(run.finishedOn)},
            {term: 'Trigger', detail: fmtRunTrigger(run.trigger)},
            {term: 'Status', detail: <RunStatus status={run.status} />},
            {term: 'Association', detail: run.association},
            {term: 'Competition', detail: run.competition},
            {term: 'Rows', detail: fmtRunNumber(run.rowsImported)},
            {term: 'Teams created', detail: fmtRunNumber(run.teamsCreated)},
            {term: 'Users created', detail: fmtRunNumber(run.usersCreated)},
            {term: 'Members created', detail: fmtRunNumber(run.membersCreated)},
            {term: 'Note', detail: <span className="fr-port-pre">{run.note || '—'}</span>},
            {
              term: 'Error',
              detail: (
                <Text as="span" size="sm" tone={run.errorMessage ? 'danger' : 'default'} className="fr-port-pre">
                  {run.errorMessage || '—'}
                </Text>
              ),
            },
          ]}
        />
      )}
    </Dialog>
  )
}

interface TSettingsForm {
  username: string
  password: string
  association: string
  competition: string
  scheduleEnabled: boolean
  scheduleStartOn?: string
  scheduleEndOn?: string
}

const readForm = (config?: TGamedayImportConfigSafe): TSettingsForm => ({
  username: config?.username ?? '',
  password: '',
  association: config?.association ?? '',
  competition: config?.competition ?? '',
  scheduleEnabled: config?.scheduleEnabled ?? false,
  scheduleStartOn: config?.scheduleStartOn,
  scheduleEndOn: config?.scheduleEndOn,
})

export function GamedaySettingsDialog({
  open,
  onOpenChange,
  season,
  state,
  reload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  season: TSeason
  state?: TGamedayState
  reload: () => Promise<unknown>
}) {
  const $save = useEndpoint($PortGamedayImportSave)
  const config = state?.config
  const [form, formSet] = useState<TSettingsForm>(() => readForm(config))
  const patch = (next: Partial<TSettingsForm>) => formSet((f) => ({...f, ...next}))
  useEffect(() => {
    if (open && state) formSet(readForm(config))
  }, [open, !!state, config?.id, config?.updatedOn])
  const loading = $save.loading
  const passwordComplete =
    Boolean(config?.hasPassword) || form.password.trim().length > 0
  const scheduleComplete =
    !form.scheduleEnabled || Boolean(form.scheduleStartOn && form.scheduleEndOn)
  const rangeInvalid =
    form.scheduleEnabled &&
    !!form.scheduleStartOn &&
    !!form.scheduleEndOn &&
    Date.parse(form.scheduleStartOn) > Date.parse(form.scheduleEndOn)
  const complete =
    [form.username, form.association, form.competition].every(
      (v) => v.trim().length > 0,
    ) &&
    passwordComplete &&
    scheduleComplete &&
    !rangeInvalid
  const scheduleDisabled = loading || !form.scheduleEnabled
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local time'
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!complete || loading) return
    $save
      .fetch({
        seasonId: season.id,
        username: form.username,
        password: form.password,
        association: form.association,
        competition: form.competition,
        scheduleEnabled: form.scheduleEnabled,
        scheduleStartOn: form.scheduleStartOn,
        scheduleEndOn: form.scheduleEndOn,
      })
      .then(async () => {
        toast.success('GameDay import settings saved.')
        patch({password: ''})
        await reload()
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      dismissable={!loading}
      icon={<Settings2 />}
      title="GameDay import settings"
      description="Save the GameDay credentials and optional daily schedule for this season. Use the separate run button when you want to start an import."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            Close
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!state || !complete}
            onClick={() => submit()}
          >
            Save settings
          </Button>
        </>
      }
    >
      {!state ? (
        <Stack align="center" className="fr-pad">
          <Spinner size={20} />
        </Stack>
      ) : (
        <form onSubmit={submit} noValidate>
          <Stack gap={4}>
            <Field label="Username" required>
              <Input
                value={form.username}
                onChange={(e) => patch({username: e.target.value})}
                disabled={loading}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Password"
              required={!config?.hasPassword}
              description={
                config?.hasPassword
                  ? 'A password is saved (encrypted). Leave blank to keep it.'
                  : undefined
              }
            >
              <Input
                type="password"
                value={form.password}
                onChange={(e) => patch({password: e.target.value})}
                placeholder={
                  config?.hasPassword
                    ? 'Leave blank to keep saved password'
                    : 'Enter GameDay password'
                }
                disabled={loading}
                autoComplete="new-password"
              />
            </Field>
            <div className="fr-grid-2 fr-port-grid">
              <Field
                label="Association"
                required
                description="Case-sensitive GameDay association name."
              >
                <Input
                  value={form.association}
                  onChange={(e) => patch({association: e.target.value})}
                  disabled={loading}
                />
              </Field>
              <Field
                label="Competition"
                required
                description="Case-sensitive GameDay competition name."
              >
                <Input
                  value={form.competition}
                  onChange={(e) => patch({competition: e.target.value})}
                  disabled={loading}
                />
              </Field>
            </div>
            <Switch
              checked={form.scheduleEnabled}
              onCheckedChange={(v) => patch({scheduleEnabled: v})}
              disabled={loading}
              label="Daily schedule"
              description={`Runs once daily after ${fmtRunTime(form.scheduleStartOn)} ${timezone}.`}
              labelPosition="start"
            />
            <div className="fr-grid-2 fr-port-grid">
              <Field
                label="Active from"
                required={form.scheduleEnabled}
                disabled={scheduleDisabled}
              >
                <DatePicker
                  value={form.scheduleStartOn ? new Date(form.scheduleStartOn) : null}
                  onValueChange={(d) =>
                    patch({
                      scheduleStartOn: d
                        ? withPickedDay(d, form.scheduleStartOn)
                        : undefined,
                    })
                  }
                  disabled={scheduleDisabled}
                  clearable
                />
              </Field>
              <Field
                label="Active until"
                required={form.scheduleEnabled}
                disabled={scheduleDisabled}
                error={
                  rangeInvalid ? 'Must be on or after the start date.' : undefined
                }
              >
                <DatePicker
                  value={form.scheduleEndOn ? new Date(form.scheduleEndOn) : null}
                  onValueChange={(d) =>
                    patch({
                      scheduleEndOn: d
                        ? withPickedDay(d, form.scheduleEndOn)
                        : undefined,
                    })
                  }
                  disabled={scheduleDisabled}
                  invalid={rangeInvalid}
                  clearable
                />
              </Field>
            </div>
          </Stack>
        </form>
      )}
    </Dialog>
  )
}

export function GamedayRunConfirmDialog({
  open,
  onOpenChange,
  season,
  config,
  reload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  season: TSeason
  config?: TGamedayImportConfigSafe
  reload: () => Promise<unknown>
}) {
  const $import = useEndpoint($PortGamedayImport)
  const loading = $import.loading
  const run = () => {
    $import
      .fetch({seasonId: season.id})
      .then(async (summary) => {
        toast.success(
          `GameDay import finished. ${summary.membersCreated} membership(s) added.`,
        )
        await reload()
        onOpenChange(false)
      })
      .catch(() => {
        void reload().catch(() => undefined)
      })
  }
  if (!config)
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        icon={<CircleAlert />}
        tone="warning"
        size="sm"
        title="GameDay settings required"
        description="Save the GameDay import settings before running an import."
        footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}
      />
    )
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      dismissable={!loading}
      hideClose={loading}
      icon={<CloudDownload />}
      title="Confirm GameDay import run"
      description={`This will sign in to GameDay with the saved encrypted credentials and import members into ${season.name}.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={run}>
            {loading ? 'Running' : 'Confirm run'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <DescriptionList
          className="fr-port-dl"
          items={[
            {term: 'Username', detail: config.username},
            {term: 'Association', detail: config.association},
            {term: 'Competition', detail: config.competition},
          ]}
        />
        <Alert tone="info">
          The import may create teams, users, and memberships. Existing members
          are skipped where they already exist.
        </Alert>
      </Stack>
    </Dialog>
  )
}
