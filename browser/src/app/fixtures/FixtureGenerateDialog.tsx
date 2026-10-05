import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  Field,
  IconButton,
  Input,
  NumberInput,
  Stack,
  Text,
  toast,
} from '@ui'
import {Plus, WandSparkles, X} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {$FixtureGenerate} from '../../core/endpoints/Fixture'
import {randomString} from '../../utils/random'

type TSlot = {id: string; time: string; place: string}

const blankSlot = (): TSlot => ({
  id: randomString(),
  time: '',
  place: '',
})

/** Magic generate: continues the round robin within each division for N rounds. */
export function FixtureGenerateDialog({
  open,
  onOpenChange,
  seasonId,
  teams,
  fixtures,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seasonId: string
  teams: TTeam[]
  fixtures: TFixture[]
  onDone: () => void
}) {
  const $generate = useEndpoint($FixtureGenerate)
  const [rounds, roundsSet] = useState<number | null>(null)
  const [start, startSet] = useState<Date | null>(null)
  const [slots, slotsSet] = useState<TSlot[]>(() => [blankSlot()])
  const [error, errorSet] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const last = fixtures.reduce<Date | null>((d, f) => {
      const fd = new Date(f.date)
      return !d || fd > d ? fd : d
    }, null)
    if (last) {
      const next = new Date(last)
      next.setDate(next.getDate() + 7)
      next.setHours(0, 0, 0, 0)
      startSet(next)
    } else startSet(null)
    roundsSet(null)
    slotsSet([blankSlot()])
    errorSet(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const missingDivision = teams.filter((t) => typeof t.division !== 'number')
  const divisions = new Set(
    teams
      .map((t) => t.division)
      .filter((d): d is number => typeof d === 'number'),
  )
  const perRound = Math.floor(teams.length / 2)

  const patch = (id: string, p: Partial<TSlot>) =>
    slotsSet((xs) => xs.map((x) => (x.id === id ? {...x, ...p} : x)))

  const generate = () => {
    if (typeof rounds !== 'number' || rounds < 1)
      return errorSet('Please enter a valid number of rounds.')
    if (!start) return errorSet('Please enter a valid starting date.')
    if (missingDivision.length)
      return errorSet('Every team needs a division before generating.')
    if (!slots.length || slots.some((x) => !x.time.trim() || !x.place.trim()))
      return errorSet('Fill in or remove empty slots.')
    if (slots.length * 2 < teams.length - 1)
      return errorSet(
        `Not enough slots have been added — each round has ${perRound} games.`,
      )
    errorSet(null)
    $generate
      .fetch({
        seasonId,
        startingDate: start.toISOString(),
        roundCount: rounds,
        slots: slots.map((x) => ({
          ...x,
          time: x.time.trim(),
          place: x.place.trim(),
        })),
      })
      .then(() => {
        toast.success(`${rounds} round${rounds === 1 ? '' : 's'} generated`)
        onDone()
      })
      .catch(() => undefined)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !$generate.loading && onOpenChange(o)}
      icon={<WandSparkles />}
      title="Generate fixtures"
      description="The generator continues from any existing rounds and maintains the round robin pattern within each division."
      size="lg"
      footer={
        <>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={$generate.loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            leading={<WandSparkles />}
            loading={$generate.loading}
            onClick={generate}
          >
            Generate
          </Button>
        </>
      }
    >
      <Stack gap={5}>
        {missingDivision.length > 0 ? (
          <Alert tone="warning" title="Before you proceed">
            All teams need a division assigned (under the Teams tab). Missing:{' '}
            {missingDivision.map((t) => t.name).join(', ')}.
          </Alert>
        ) : (
          <Alert tone="info">
            {divisions.size} division{divisions.size === 1 ? '' : 's'} ·{' '}
            {teams.length} team{teams.length === 1 ? '' : 's'} · {perRound} game
            {perRound === 1 ? '' : 's'} per round
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="fr-grid-2">
          <Field label="Number of rounds">
            <NumberInput
              value={rounds}
              onValueChange={roundsSet}
              min={1}
              placeholder="e.g. 4"
            />
          </Field>
          <Field label="Starting date">
            <DatePicker value={start} onValueChange={startSet} />
          </Field>
        </div>
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Slots
          </Text>
          <Text size="xs" tone="tertiary">
            Games are placed into these time and place slots each round.
          </Text>
          {slots.map((slot, i) => (
            <div key={slot.id} className="fr-fx-slot">
              <Input
                aria-label={`Slot ${i + 1} time`}
                value={slot.time}
                placeholder="Time"
                onChange={(e) => patch(slot.id, {time: e.target.value})}
              />
              <Input
                aria-label={`Slot ${i + 1} place`}
                value={slot.place}
                placeholder="Place"
                onChange={(e) => patch(slot.id, {place: e.target.value})}
              />
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={`Remove slot ${i + 1}`}
                onClick={() =>
                  slotsSet((xs) => xs.filter((x) => x.id !== slot.id))
                }
              >
                <X />
              </IconButton>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus />}
            style={{alignSelf: 'flex-start'}}
            onClick={() => slotsSet((xs) => [...xs, blankSlot()])}
          >
            Add slot
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  )
}
