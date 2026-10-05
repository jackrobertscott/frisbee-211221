import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {
  Alert,
  Button,
  ConfirmDialog,
  DatePicker,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
  toast,
  type Option,
} from '@ui'
import {ArrowLeftRight, Check, Plus, Shuffle, Trash2, X} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {
  $FixtureCreate,
  $FixtureDelete,
  $FixtureUpdate,
} from '../../core/endpoints/Fixture'
import {randomString} from '../../utils/random'
import {TeamName, teamOptions} from '../common/TeamName'
import {compareGameSlot, type TFixtureGame} from './FixtureGames'

type TFormGame = TFixtureGame

const blankGame = (): TFormGame => ({
  id: randomString(),
  team1Id: '',
  team2Id: '',
  time: '',
  place: '',
})

/** Applies a picked day while keeping the previous time of day (new dates start at midnight). */
const keepTimeOfDay = (picked: Date | null, previous: Date | null) => {
  if (!picked) return null
  const next = previous ? new Date(previous) : new Date(picked)
  if (!previous) next.setHours(0, 0, 0, 0)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next
}

/** Create (fixture = 'new') or edit a fixture: title, date, games, grading flag; delete. */
export function FixtureEditDialog({
  fixture,
  teams,
  onClose,
  onDone,
}: {
  fixture: TFixture | 'new' | null
  teams: TTeam[]
  onClose: () => void
  onDone: () => void
}) {
  const auth = useAuth()
  const $create = useEndpoint($FixtureCreate)
  const $update = useEndpoint($FixtureUpdate)
  const $delete = useEndpoint($FixtureDelete)
  const isNew = fixture === 'new'
  const [title, titleSet] = useState('')
  const [date, dateSet] = useState<Date | null>(null)
  const [games, gamesSet] = useState<TFormGame[]>([])
  const [grading, gradingSet] = useState(false)
  const [error, errorSet] = useState<string | null>(null)
  const [confirmDelete, confirmDeleteSet] = useState(false)
  const [swapId, swapIdSet] = useState<string>()

  useEffect(() => {
    if (!fixture) return
    errorSet(null)
    swapIdSet(undefined)
    if (fixture === 'new') {
      titleSet('')
      dateSet(null)
      gamesSet(
        Array.from({length: Math.floor(teams.length / 2)}, () => blankGame()),
      )
      gradingSet(false)
    } else {
      titleSet(fixture.title)
      dateSet(new Date(fixture.date))
      gamesSet(fixture.games.map((g) => ({...g})))
      gradingSet(!!fixture.grading)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture])

  const patch = (id: string, p: Partial<TFormGame>) =>
    gamesSet((gs) => gs.map((g) => (g.id === id ? {...g, ...p} : g)))

  const counts = new Map<string, number>()
  games.forEach((g) =>
    [g.team1Id, g.team2Id].forEach(
      (id) => id && counts.set(id, (counts.get(id) ?? 0) + 1),
    ),
  )
  const doubled = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => teams.find((t) => t.id === id)?.name ?? 'Unknown team')
  const options: Option[] = teamOptions(teams).map((o) =>
    counts.has(o.value)
      ? {...o, meta: <Check aria-label="Already playing" size={14} />}
      : o,
  )

  const swapSlot = (targetId: string) => {
    const source = games.find((g) => g.id === swapId)
    const target = games.find((g) => g.id === targetId)
    swapIdSet(undefined)
    if (!source || !target || source.id === target.id) return
    gamesSet((gs) =>
      gs
        .map((g) => {
          if (g.id === source.id)
            return {...g, time: target.time, place: target.place}
          if (g.id === target.id)
            return {...g, time: source.time, place: source.place}
          return g
        })
        .sort(compareGameSlot),
    )
    toast('Game slot changed. Remember to save the fixture.')
  }

  const loading = $create.loading || $update.loading
  const save = () => {
    if (!title.trim()) return errorSet('Enter a title for the fixture.')
    if (!date) return errorSet('Pick the date of the fixture.')
    if (games.some((g) => !g.team1Id || !g.team2Id))
      return errorSet('Pick both teams for every game, or remove empty rows.')
    if (games.some((g) => g.team1Id === g.team2Id))
      return errorSet('A team can’t play itself.')
    if (games.some((g) => !g.time.trim() || !g.place.trim()))
      return errorSet('Enter a time and place for every game.')
    errorSet(null)
    const payload = {
      title: title.trim(),
      date: date.toISOString(),
      games: games.map((g) => ({
        ...g,
        time: g.time.trim(),
        place: g.place.trim(),
      })),
      grading,
    }
    const request =
      fixture === 'new' || !fixture
        ? $create.fetch({...payload, seasonId: auth.season!.id})
        : $update.fetch({...payload, fixtureId: fixture.id})
    request
      .then((saved) => {
        toast.success(isNew ? `${saved.title} added` : `${saved.title} saved`)
        onDone()
      })
      .catch(() => undefined)
  }

  const remove = async () => {
    if (!fixture || fixture === 'new') return
    await $delete
      .fetch({fixtureId: fixture.id})
      .then(() => {
        toast(`${fixture.title} deleted`)
        onDone()
      })
  }

  const swapSource = games.find((g) => g.id === swapId)
  const teamById = (id: string) => teams.find((t) => t.id === id)

  return (
    <>
      <Dialog
        open={!!fixture}
        onOpenChange={(o) => !o && onClose()}
        size="xl"
        title={isNew ? 'Add fixture' : 'Edit fixture'}
        footer={
          <>
            {!isNew && (
              <Button
                variant="danger"
                leading={<Trash2 />}
                onClick={() => confirmDeleteSet(true)}
                className="fr-footer-left"
              >
                Delete
              </Button>
            )}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={save}>
              {isNew ? 'Add fixture' : 'Save changes'}
            </Button>
          </>
        }
      >
        <Stack gap={5}>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="fr-grid-2">
            <Field label="Title">
              <Input
                value={title}
                placeholder="Round 1"
                onChange={(e) => titleSet(e.target.value)}
              />
            </Field>
            <Field label="Date">
              <DatePicker
                value={date}
                onValueChange={(picked) => dateSet(keepTimeOfDay(picked, date))}
              />
            </Field>
          </div>

          <Stack gap={2}>
            <Text size="sm" weight="medium">
              Games
            </Text>
            {!teams.length ? (
              <Text size="sm" tone="tertiary">
                Add teams to this season before scheduling games.
              </Text>
            ) : (
              <div className="fr-fx-games" role="list">
                {games.length > 0 && (
                  <div className="fr-fx-games__head" aria-hidden>
                    <span>Team 1</span>
                    <span />
                    <span>Team 2</span>
                    <span>Time</span>
                    <span>Place</span>
                    <span />
                  </div>
                )}
                {games.map((g, i) => (
                  <div key={g.id} className="fr-fx-games__row" role="listitem">
                    <Select
                      aria-label={`Game ${i + 1} team 1`}
                      placeholder="Team 1"
                      searchable
                      options={options}
                      value={g.team1Id || null}
                      onValueChange={(v) => patch(g.id, {team1Id: v ?? ''})}
                      invalid={!!g.team1Id && (counts.get(g.team1Id) ?? 0) > 1}
                    />
                    <Tooltip content="Swap teams">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label={`Swap teams in game ${i + 1}`}
                        onClick={() =>
                          patch(g.id, {
                            team1Id: g.team2Id,
                            team2Id: g.team1Id,
                            team1Score: g.team2Score,
                            team2Score: g.team1Score,
                          })
                        }
                      >
                        <ArrowLeftRight />
                      </IconButton>
                    </Tooltip>
                    <Select
                      aria-label={`Game ${i + 1} team 2`}
                      placeholder="Team 2"
                      searchable
                      options={options}
                      value={g.team2Id || null}
                      onValueChange={(v) => patch(g.id, {team2Id: v ?? ''})}
                      invalid={!!g.team2Id && (counts.get(g.team2Id) ?? 0) > 1}
                    />
                    <Input
                      aria-label={`Game ${i + 1} time`}
                      value={g.time}
                      placeholder="Time"
                      onChange={(e) => patch(g.id, {time: e.target.value})}
                    />
                    <Input
                      aria-label={`Game ${i + 1} place`}
                      value={g.place}
                      placeholder="Place"
                      onChange={(e) => patch(g.id, {place: e.target.value})}
                    />
                    <div className="fr-fx-games__actions">
                      <Tooltip content="Swap time and place with another game">
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Swap time and place of game ${i + 1}`}
                          disabled={games.length < 2}
                          onClick={() => swapIdSet(g.id)}
                        >
                          <Shuffle />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content="Remove game">
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove game ${i + 1}`}
                          onClick={() =>
                            gamesSet((gs) => gs.filter((x) => x.id !== g.id))
                          }
                        >
                          <X />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {doubled.length > 0 && (
              <Text size="xs" tone="danger">
                Playing more than once: {doubled.join(', ')}
              </Text>
            )}
            {teams.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                leading={<Plus />}
                style={{alignSelf: 'flex-start'}}
                onClick={() => gamesSet((gs) => [...gs, blankGame()])}
              >
                Add game
              </Button>
            )}
          </Stack>

          <Switch
            checked={grading}
            onCheckedChange={gradingSet}
            label="Grading round"
            description="The results of this fixture will not be included in the ladder."
            labelPosition="start"
          />
        </Stack>
      </Dialog>

      <Dialog
        open={!!swapSource}
        onOpenChange={(o) => !o && swapIdSet(undefined)}
        icon={<Shuffle />}
        title="Swap game slot"
        description={
          swapSource
            ? `Choose a game to trade time and place with (currently ${swapSource.time.trim() || 'no time'} · ${swapSource.place.trim() || 'no place'}).`
            : undefined
        }
        footer={<Button onClick={() => swapIdSet(undefined)}>Cancel</Button>}
      >
        <div className="fr-fx-swap">
          {games
            .filter((g) => g.id !== swapId)
            .map((g) => (
              <div key={g.id} className="fr-fx-swap__row">
                <div className="fr-fx-swap__teams">
                  {g.team1Id ? (
                    <TeamName team={teamById(g.team1Id)} />
                  ) : (
                    <Text as="span" size="sm" tone="tertiary">
                      Unassigned
                    </Text>
                  )}
                  {g.team2Id ? (
                    <TeamName team={teamById(g.team2Id)} />
                  ) : (
                    <Text as="span" size="sm" tone="tertiary">
                      Unassigned
                    </Text>
                  )}
                </div>
                <span className="fr-fx-swap__slot">
                  {g.time.trim() || 'No time'} · {g.place.trim() || 'No place'}
                </span>
                <Button size="sm" onClick={() => swapSlot(g.id)}>
                  Swap
                </Button>
              </div>
            ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={confirmDeleteSet}
        tone="danger"
        icon={<Trash2 />}
        title="Delete this fixture?"
        description="Are you sure you wish to permanently delete this fixture? This can’t be undone."
        confirmLabel="Delete fixture"
        confirmVariant="danger"
        onConfirm={remove}
      />
    </>
  )
}
