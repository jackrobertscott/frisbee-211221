import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {Button, Dialog, NumberInput, Stack, Text, toast} from '@ui'
import {Trophy} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useEndpoint} from '../../core/useEndpoint'
import {$SeasonUpdate} from '../../endpoints/Season'
import {TeamName} from '../shared'
import './ladder.css'

type TFinalResults = NonNullable<TSeason['finalResults']>

/** Admin: set each team's finishing position per division (blank = no position). */
export function FinalResultsDialog({
  open,
  onOpenChange,
  season,
  teams,
  divisions,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  season: TSeason
  teams: TTeam[]
  divisions: number[]
  onSaved: (season: TSeason) => void
}) {
  const $updateSeason = useEndpoint($SeasonUpdate)
  const [results, resultsSet] = useState<TFinalResults>([])
  useEffect(() => {
    if (open) resultsSet(season.finalResults ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const positionOf = (teamId: string) =>
    results.find((r) => r.teamId === teamId)?.position ?? null
  const positionSet = (teamId: string, position: number | null) =>
    resultsSet((rs) =>
      rs.some((r) => r.teamId === teamId)
        ? rs.map((r) => (r.teamId === teamId ? {...r, position} : r))
        : rs.concat({teamId, position}),
    )

  const save = () => {
    $updateSeason
      .fetch({
        seasonId: season.id,
        name: season.name,
        isHidden: season.isHidden,
        signUpOpen: season.signUpOpen,
        genderDivision: season.genderDivision,
        finalResults: results,
      })
      .then((updated) => {
        toast.success('Final results saved')
        onSaved(updated)
      })
      .catch(() => undefined)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Trophy />}
      title="Final results"
      description="Enter each team’s finishing position in its division. Leave blank for no position. First place gets the trophy."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={$updateSeason.loading}
            onClick={save}
          >
            Save results
          </Button>
        </>
      }
    >
      {divisions.length ? (
        <div className="fr-grid-2 fr-grid-2--wide">
          {divisions.map((division) => {
            const ofDiv = teams.filter((t) => t.division === division)
            return (
              <Stack key={division} gap={2}>
                <Text
                  size="xs"
                  weight="medium"
                  tone="tertiary"
                  className="fr-eyebrow"
                >
                  Division {division}
                </Text>
                <ul className="fr-ladder-final-list">
                  {ofDiv.map((team) => (
                    <li key={team.id} className="fr-ladder-final-pos">
                      <NumberInput
                        className="fr-ladder-final-pos__input"
                        aria-label={`${team.name} position`}
                        size="sm"
                        variant="inline"
                        min={1}
                        placeholder="—"
                        value={positionOf(team.id)}
                        onValueChange={(v) => positionSet(team.id, v)}
                      />
                      <TeamName team={team} />
                    </li>
                  ))}
                </ul>
              </Stack>
            )
          })}
        </div>
      ) : (
        <Text size="sm" tone="tertiary">
          Assign teams to divisions before entering final results.
        </Text>
      )}
    </Dialog>
  )
}
