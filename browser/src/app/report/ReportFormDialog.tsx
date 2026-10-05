import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {officialSpiritCommentRequired} from '@shared/utils/reportValidation'
import {
  Button,
  Dialog,
  Divider,
  EmptyState,
  Field,
  Link,
  NumberInput,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
  toast,
} from '@ui'
import {Info, Megaphone, Trash2} from 'lucide-react'
import {type ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {$FeatureReportEditorLoad} from '../../endpoints/Feature'
import {
  SPIRIT_CATEGORY_DESCRIPTIONS,
  SPIRIT_CATEGORY_OPTIONS,
  SPIRIT_OPTIONS,
} from '../../utils/constants'
import {fmtShort, fullName, Loading, TeamName, teamOptions} from '../shared'
import {
  createReportFormDataFromReport,
  eligibleMvpUsers,
  getLatestPastFixtureId,
  getReportMvpSlots,
  type ReportAgainstOption,
  type ReportFormData,
  sameMvps,
  sanitizeReportFormMvps,
  shuffleArray,
  SPIRIT_FIELDS,
  SPIRIT_GRID_URL,
  validateReportForm,
} from './reportForm'
import './ReportFormDialog.css'

const SPIRIT_CATEGORY_SELECT = SPIRIT_CATEGORY_OPTIONS.map((o) => ({
  value: o.key,
  label: o.label,
}))

/** Splits "4: This team was…" into the score and its description. */
const SPIRIT_SIMPLE = SPIRIT_OPTIONS.map((o) => {
  const i = o.label.indexOf(':')
  return {
    value: o.key,
    label: i > 0 ? o.label.slice(0, i) : o.key,
    description: i > 0 ? o.label.slice(i + 1).trim() : o.label,
  }
})

/**
 * Score report form in a dialog. 'public' is the player flow (team fixed to
 * the user's own unless admin); 'dashboard' is the admin create/edit flow.
 */
export function ReportFormDialog({
  open,
  onOpenChange,
  variant,
  title,
  initialData,
  initialFixtures,
  initialTeams,
  submitter,
  loading,
  onSubmit,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant: 'public' | 'dashboard'
  title: string
  initialData?: TReport
  initialFixtures?: TFixture[]
  initialTeams?: TTeam[]
  submitter?: string
  loading?: boolean
  onSubmit: (data: ReportFormData) => void
  onDelete?: () => void
}) {
  const auth = useAuth()
  const season = auth.season
  const $editorLoad = useEndpoint($FeatureReportEditorLoad)
  const isDashboard = variant === 'dashboard'
  const isEditing = !!initialData?.id
  const official = season?.useOfficialScoring === true
  const canChooseTeam = isDashboard || auth.isAdmin()
  const preferredTeamId = auth.current?.team?.id

  const [fixtures, fixturesSet] = useState(initialFixtures)
  const [teams, teamsSet] = useState(initialTeams)
  const [againstOptions, againstOptionsSet] = useState<ReportAgainstOption[]>()
  const [form, formSet] = useState<ReportFormData>(() =>
    createReportFormDataFromReport(initialData ?? {teamId: preferredTeamId}),
  )
  const patch = (p: Partial<ReportFormData>) => formSet((f) => ({...f, ...p}))
  const formRef = useRef(form)
  formRef.current = form

  // Reset whenever the dialog opens or switches to another report.
  useEffect(() => {
    if (!open) return
    againstOptionsSet(undefined)
    formSet(createReportFormDataFromReport(initialData ?? {teamId: preferredTeamId}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?.id])

  useEffect(() => {
    if (initialFixtures !== undefined) fixturesSet(initialFixtures)
  }, [initialFixtures])
  useEffect(() => {
    if (initialTeams !== undefined) teamsSet(initialTeams)
  }, [initialTeams])

  useEffect(() => {
    if (!open || !season) return
    if (initialFixtures !== undefined && initialTeams !== undefined) return
    $editorLoad
      .fetch({seasonId: season.id})
      .then((data) => {
        fixturesSet(data.fixtures)
        teamsSet(data.teams)
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, season?.id, initialFixtures, initialTeams])

  // Players without admin rights always report for their own team.
  useEffect(() => {
    if (!open || isEditing || !preferredTeamId || form.teamId === preferredTeamId)
      return
    if (!canChooseTeam || !form.teamId) patch({teamId: preferredTeamId})
  }, [open, canChooseTeam, form.teamId, isEditing, preferredTeamId])

  const defaultFixtureId = getLatestPastFixtureId(fixtures)
  useEffect(() => {
    if (!open || isEditing || form.fixtureId || !defaultFixtureId) return
    patch({fixtureId: defaultFixtureId})
  }, [open, defaultFixtureId, form.fixtureId, isEditing])

  // Opposition teams (and their players) for the chosen fixture + team.
  useEffect(() => {
    if (!open || !season || !form.fixtureId || !form.teamId) {
      againstOptionsSet(undefined)
      return
    }
    let cancelled = false
    againstOptionsSet(undefined)
    $editorLoad
      .fetch({seasonId: season.id, fixtureId: form.fixtureId, teamId: form.teamId})
      .then((data) => {
        if (cancelled) return
        fixturesSet(data.fixtures)
        teamsSet(data.teams)
        againstOptionsSet(data.againstOptions)
        const current = formRef.current.againstTeamId
        const hasCurrent = data.againstOptions.some((o) => o.team.id === current)
        patch({
          againstTeamId:
            data.againstOptions.length === 1
              ? data.againstOptions[0].team.id
              : hasCurrent
                ? current
                : undefined,
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, season?.id, form.fixtureId, form.teamId])

  const chosenAgainst = againstOptions?.find(
    (o) => o.team.id === form.againstTeamId,
  )
  const selectedTeam = teams?.find((t) => t.id === form.teamId)

  // Keep MVP picks valid for the chosen opposition and season division.
  useEffect(() => {
    const next = sanitizeReportFormMvps(form, chosenAgainst?.users, season)
    if (!sameMvps(next, form)) patch(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chosenAgainst,
    form.mvpMale,
    form.mvpFemale,
    form.mvpMale2,
    form.mvpFemale2,
    season?.genderDivision,
  ])

  const players = useMemo(
    () =>
      isDashboard
        ? (chosenAgainst?.users ?? [])
        : shuffleArray(chosenAgainst?.users ?? []),
    [chosenAgainst, isDashboard],
  )

  const submit = () => {
    const error = validateReportForm(form, official, season)
    if (error) {
      toast.error(error)
      return
    }
    onSubmit(form)
  }

  const fixtureOptions = (fixtures ?? []).map((f) => ({
    value: f.id,
    label: f.title,
    meta: fmtShort(f.date),
  }))
  const againstSelectOptions = teamOptions((againstOptions ?? []).map((o) => o.team))
  const fixtureLocked = isDashboard && !!initialData?.fixtureId
  const teamLocked = isDashboard && !!initialData?.teamId
  const againstLocked = isDashboard && !!initialData?.teamAgainstId
  const awaitingAgainst = !!form.fixtureId && !!form.teamId && !againstOptions

  const againstField = (
    <Field
      label={isDashboard ? 'Against' : 'Opponent'}
      description={
        againstOptions && !againstOptions.length
          ? 'No opposition found for this team in the selected fixture.'
          : undefined
      }
    >
      <Select
        placeholder={awaitingAgainst ? 'Loading…' : 'Select opponent'}
        searchable={againstSelectOptions.length > 8}
        disabled={againstLocked || !againstOptions}
        value={form.againstTeamId ?? null}
        onValueChange={(v) => patch({againstTeamId: v ?? undefined})}
        options={againstSelectOptions}
        emptyText="No opposition found"
      />
    </Field>
  )

  let body: ReactNode
  if (fixtures === undefined || teams === undefined) {
    body = <Loading label="Loading fixtures" />
  } else {
    const ready = !!againstOptions && (isDashboard || !!selectedTeam)
    body = (
      <Stack gap={5}>
        {submitter && (
          <Field label="Submitted by">
            <div className="fr-readonly">
              <Text as="span" size="sm" tone="secondary">
                {submitter}
              </Text>
            </div>
          </Field>
        )}
        <div className="fr-grid-2">
          <Field label="Fixture">
            <Select
              placeholder="Select a fixture"
              searchable={fixtureOptions.length > 8}
              disabled={fixtureLocked}
              value={form.fixtureId ?? null}
              onValueChange={(v) => v && patch({fixtureId: v})}
              options={fixtureOptions}
              emptyText="No fixtures this season"
            />
          </Field>
          <Field label={isDashboard ? 'For' : 'Reporting for'}>
            {canChooseTeam ? (
              <Select
                placeholder="Select a team"
                searchable
                disabled={teamLocked}
                value={form.teamId ?? null}
                onValueChange={(v) => v && patch({teamId: v})}
                options={teamOptions(teams)}
              />
            ) : (
              <div className="fr-readonly">
                <TeamName team={selectedTeam ?? auth.current?.team} size="md" />
              </div>
            )}
          </Field>
        </div>
        {(isDashboard || ready) && againstField}
        {!ready ? (
          awaitingAgainst ? (
            <Loading label="Loading teams and players" />
          ) : isDashboard ? null : (
            <EmptyState
              icon={<Megaphone />}
              title="Submit a report"
              description="Score reports include the game score, MVPs, and spirit."
            />
          )
        ) : (
          <>
            <div className="fr-grid-2">
              <Field label={isDashboard ? 'For score' : 'Your score'}>
                <NumberInput
                  value={form.scoreFor ?? null}
                  onValueChange={(v) => patch({scoreFor: v ?? undefined})}
                  min={0}
                  placeholder="0"
                />
              </Field>
              <Field label={isDashboard ? 'Against score' : 'Opponent score'}>
                <NumberInput
                  value={form.scoreAgainst ?? null}
                  onValueChange={(v) => patch({scoreAgainst: v ?? undefined})}
                  min={0}
                  placeholder="0"
                />
              </Field>
            </div>
            <MvpFields
              form={form}
              patch={patch}
              players={players}
              hasOpponent={!!chosenAgainst}
              official={official}
            />
            <SpiritFields form={form} patch={patch} official={official} />
          </>
        )}
      </Stack>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={isEditing ? undefined : <Megaphone />}
      title={title}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={submit}
          >
            {isEditing ? 'Save report' : 'Submit report'}
          </Button>
          {onDelete && (
            <Button
              variant="danger"
              leading={<Trash2 />}
              onClick={onDelete}
              className="fr-report-delete"
            >
              Delete
            </Button>
          )}
        </>
      }
    >
      {body}
    </Dialog>
  )
}

function MvpFields({
  form,
  patch,
  players,
  hasOpponent,
  official,
}: {
  form: ReportFormData
  patch: (p: Partial<ReportFormData>) => void
  players: ReportAgainstOption['users']
  hasOpponent: boolean
  official: boolean
}) {
  const auth = useAuth()
  const slots = getReportMvpSlots(auth.season, official)
  if (!slots.length) return null
  return (
    <>
      <Divider label="MVPs from the opposition" />
      <div className="fr-grid-2">
        {slots.map((s) => (
          <Field key={s.field} label={s.label} optional>
            <Select
              placeholder={hasOpponent ? 'Select a player' : 'Choose opponent first'}
              disabled={!hasOpponent}
              searchable
              clearable
              value={form[s.field] ?? null}
              onValueChange={(v) => patch({[s.field]: v ?? undefined})}
              options={eligibleMvpUsers(players, s.slot, form[s.pair]).map((u) => ({
                value: u.id,
                label: fullName(u),
              }))}
              emptyText="No eligible players"
            />
          </Field>
        ))}
      </div>
      {official && (
        <Text size="xs" tone="tertiary">
          MVP 1 votes are worth 5 points, MVP 2 votes 3 points.
        </Text>
      )}
    </>
  )
}

function SpiritFields({
  form,
  patch,
  official,
}: {
  form: ReportFormData
  patch: (p: Partial<ReportFormData>) => void
  official: boolean
}) {
  const commentRequired = official && officialSpiritCommentRequired(form)
  const total = SPIRIT_FIELDS.reduce((sum, f) => sum + (form[f] ?? 0), 0)
  return (
    <>
      <Divider label="Spirit of the game" />
      <Text size="sm" tone="secondary">
        See details of the Spirit Scoring System{' '}
        <Link href={SPIRIT_GRID_URL} external>
          here
        </Link>
        .
      </Text>
      {official ? (
        <Stack gap={2}>
          {SPIRIT_FIELDS.map((field) => {
            const c = SPIRIT_CATEGORY_DESCRIPTIONS[field]
            return (
              <div key={field} className="fr-spirit-row">
                <Text as="span" size="sm" className="fr-spirit-row__label">
                  {c.title}
                  <Tooltip content={c.description}>
                    <span className="fr-info" tabIndex={0} aria-label={c.description}>
                      <Info />
                    </span>
                  </Tooltip>
                </Text>
                <Select
                  aria-label={c.title}
                  size="sm"
                  placeholder="Select…"
                  value={form[field]?.toString() ?? null}
                  onValueChange={(v) => v !== null && patch({[field]: Number(v)})}
                  options={SPIRIT_CATEGORY_SELECT}
                />
              </div>
            )
          })}
          <div className="fr-spirit-total">
            <Text size="sm" tone="secondary">
              Total
            </Text>
            <Text size="lg" weight="semibold" className="fr-num">
              {total}
              <Text as="span" size="sm" tone="tertiary">
                {' '}
                / 20
              </Text>
            </Text>
          </div>
        </Stack>
      ) : (
        <Field label="Spirit score">
          <RadioGroup
            aria-label="Spirit score"
            value={form.spirit?.toString()}
            onValueChange={(v) => patch({spirit: Number(v)})}
          >
            {SPIRIT_SIMPLE.map((o) => (
              <Radio key={o.value} value={o.value} label={o.label} description={o.description} />
            ))}
          </RadioGroup>
        </Field>
      )}
      <Field
        label="Comment"
        optional={!commentRequired}
        required={commentRequired}
        description={
          official
            ? 'Required when the total spirit score is below 9 or above 11.'
            : undefined
        }
      >
        <Textarea
          value={form.spiritComment}
          onChange={(e) => patch({spiritComment: e.target.value})}
          rows={3}
          autoResize
          placeholder={official ? 'Write a comment…' : 'Write a comment… (optional)'}
        />
      </Field>
    </>
  )
}
