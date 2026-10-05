import {TFixture} from '@shared/schemas/ioFixture'
import {
  Alert,
  Button,
  Dialog,
  Field,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  toast,
} from '@ui'
import {CalendarClock} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useEndpoint} from '../../core/useEndpoint'
import {$FixtureAdjustMultiple} from '../../endpoints/Fixture'
import {fmtDate} from '../shared'

type TUnit = 'day' | 'week' | 'month'
type TDirection = 'forward' | 'backward'

const UNIT_OPTIONS: Array<{value: TUnit; label: string}> = [
  {value: 'day', label: 'Days'},
  {value: 'week', label: 'Weeks'},
  {value: 'month', label: 'Months'},
]

const isUnit = (v: string): v is TUnit =>
  UNIT_OPTIONS.some((o) => o.value === v)

/** Shift every fixture on/after a reference fixture by N days, weeks or months. */
export function FixtureAdjustDialog({
  open,
  onOpenChange,
  fixtures,
  seasonId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fixtures: TFixture[]
  seasonId: string
  onDone: () => void
}) {
  const $adjust = useEndpoint($FixtureAdjustMultiple)
  const [referenceId, referenceIdSet] = useState<string | null>(null)
  const [amount, amountSet] = useState<number | null>(1)
  const [unit, unitSet] = useState<TUnit>('week')
  const [direction, directionSet] = useState<TDirection>('forward')
  const [error, errorSet] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    referenceIdSet(null)
    amountSet(1)
    unitSet('week')
    directionSet('forward')
    errorSet(null)
  }, [open])

  const reference = fixtures.find((f) => f.id === referenceId)
  const affected = reference
    ? fixtures.filter((f) => new Date(f.date) >= new Date(reference.date))
        .length
    : 0
  const unitLabel = UNIT_OPTIONS.find(
    (o) => o.value === unit,
  )?.label.toLowerCase()

  const apply = () => {
    if (!referenceId) return errorSet('Please select a reference fixture.')
    if (!amount || amount <= 0)
      return errorSet('Please enter an amount greater than 0.')
    errorSet(null)
    $adjust
      .fetch({
        seasonId,
        referenceFixtureId: referenceId,
        amount,
        unit,
        direction,
      })
      .then((result) => {
        if (result.count > 0)
          toast.success(`Successfully adjusted ${result.count} fixtures`)
        onDone()
      })
      .catch(() => undefined)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !$adjust.loading && onOpenChange(o)}
      icon={<CalendarClock />}
      title="Adjust fixtures"
      description="Move a block of fixtures at once, e.g. after a washed-out round."
      footer={
        <>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={$adjust.loading}
          >
            Cancel
          </Button>
          <Button variant="primary" loading={$adjust.loading} onClick={apply}>
            Adjust fixtures
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="After and including">
          <Select
            placeholder="Select a fixture"
            value={referenceId}
            onValueChange={(v) => {
              referenceIdSet(v)
              errorSet(null)
            }}
            disabled={$adjust.loading}
            options={fixtures.map((f) => ({
              value: f.id,
              label: f.title,
              meta: fmtDate(f.date),
            }))}
          />
        </Field>
        <div className="fr-grid-2">
          <Field label="Adjustment amount">
            <NumberInput
              value={amount}
              onValueChange={amountSet}
              min={1}
              disabled={$adjust.loading}
            />
          </Field>
          <Field label="Unit">
            <Select
              value={unit}
              onValueChange={(v) => v && isUnit(v) && unitSet(v)}
              options={UNIT_OPTIONS}
              disabled={$adjust.loading}
            />
          </Field>
        </div>
        <Field label="Direction">
          <SegmentedControl
            fullWidth
            value={direction}
            onValueChange={(v) =>
              directionSet(v === 'backward' ? 'backward' : 'forward')
            }
            options={[
              {value: 'forward', label: 'Forward (into future)'},
              {value: 'backward', label: 'Backward (into past)'},
            ]}
          />
        </Field>
        {reference && amount ? (
          <Alert tone="info">
            {affected} fixture{affected === 1 ? '' : 's'} will move {amount}{' '}
            {amount === 1 ? unitLabel?.replace(/s$/, '') : unitLabel}{' '}
            {direction === 'forward' ? 'later' : 'earlier'}.
          </Alert>
        ) : null}
      </Stack>
    </Dialog>
  )
}
