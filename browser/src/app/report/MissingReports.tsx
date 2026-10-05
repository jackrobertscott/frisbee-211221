import {Badge, Button, Dialog, EmptyState, Field, Stack, toast} from '@ui'
import {CircleCheck, ClipboardList, Copy} from 'lucide-react'
import {useState} from 'react'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$ReportMissingList} from '../../endpoints/Report'
import {FixtureRow, Loading, TeamName} from '../shared'
import './MissingReports.css'

type TMissingRound = {
  title: string
  fixtureId: string
  date: Date | string
  missingTeams: Array<{id: string; name: string; color?: string}>
}

const fmtRoundDate = (d: Date | string) =>
  new Intl.DateTimeFormat('en-AU', {month: 'short', day: 'numeric'}).format(
    new Date(d),
  )

const roundLabel = (round: TMissingRound) =>
  `${round.title} - ${fmtRoundDate(round.date)}`

const isPast = (round: TMissingRound) => new Date(round.date).valueOf() < Date.now()

const missingText = (rounds: TMissingRound[]) =>
  rounds
    .map((round) =>
      [roundLabel(round), ...round.missingTeams.map((t) => `- ${t.name}`)].join('\n'),
    )
    .join('\n\n')

/** Button that opens a dialog listing teams that haven't reported, per fixture. */
export function MissingReportsButton({
  seasonId,
  label = 'Missing reports',
  size = 'md',
}: {
  seasonId: string
  label?: string
  size?: 'sm' | 'md'
}) {
  const [open, openSet] = useState(false)
  return (
    <>
      <Button size={size} leading={<ClipboardList />} onClick={() => openSet(true)}>
        {label}
      </Button>
      {open && (
        <MissingReportsDialog seasonId={seasonId} onClose={() => openSet(false)} />
      )}
    </>
  )
}

function MissingReportsDialog({
  seasonId,
  onClose,
}: {
  seasonId: string
  onClose: () => void
}) {
  const $missing = useEndpoint($ReportMissingList)
  const [openIds, openIdsSet] = useState<string[]>([])
  const {data: rounds, loading} = useLoad(
    () =>
      $missing.fetch({seasonId}).then((data) => {
        openIdsSet(data.filter(isPast).map((r) => r.fixtureId))
        return data
      }),
    [seasonId],
  )
  const past = (rounds ?? []).filter(isPast)
  const text = missingText(past)
  const total = past.reduce((n, r) => n + r.missingTeams.length, 0)
  const toggle = (id: string) =>
    openIdsSet((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Copied missing reports'))
      .catch(() => toast.error('Could not copy to the clipboard.'))
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      icon={<ClipboardList />}
      title="Missing reports"
      description={
        total
          ? `${total} report${total === 1 ? '' : 's'} outstanding across ${past.length} played fixture${past.length === 1 ? '' : 's'}.`
          : undefined
      }
      size="xl"
      footer={
        <>
          {!!text && (
            <Button leading={<Copy />} onClick={copy} className="fr-footer-left">
              Copy as text
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {loading && !rounds ? (
        <Loading label="Loading missing reports" />
      ) : !rounds?.length ? (
        <EmptyState
          icon={<CircleCheck />}
          title="No missing reports found."
          description="Every team has reported for every fixture."
        />
      ) : (
        <div className="fr-missing">
          <Stack gap={2} className="fr-missing__rounds">
            {rounds.map((round) => (
              <FixtureRow
                key={round.fixtureId}
                title={round.title}
                meta={
                  <>
                    {fmtRoundDate(round.date)}
                    <Badge size="sm" tone={isPast(round) ? 'warning' : 'neutral'}>
                      {round.missingTeams.length}
                    </Badge>
                  </>
                }
                open={openIds.includes(round.fixtureId)}
                onToggle={() => toggle(round.fixtureId)}
              >
                <ul className="fr-list">
                  {round.missingTeams.map((team) => (
                    <li key={team.id}>
                      <TeamName team={team} />
                    </li>
                  ))}
                </ul>
              </FixtureRow>
            ))}
          </Stack>
          <Field label="Text copy" description="Played fixtures only. Click to select all.">
            <pre
              className="fr-missing__text"
              tabIndex={0}
              onClick={(e) => {
                const selection = window.getSelection()
                // Keep an existing selection (e.g. copying a single team).
                if (!selection || selection.toString()) return
                selection.selectAllChildren(e.currentTarget)
              }}
            >
              {text || 'No outstanding reports for played fixtures.'}
            </pre>
          </Field>
        </div>
      )}
    </Dialog>
  )
}
