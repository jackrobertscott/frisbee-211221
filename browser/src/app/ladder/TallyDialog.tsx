import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Dialog,
  NumberInput,
  Stack,
  Text,
  Tooltip,
  toast,
} from '@ui'
import {CircleCheck, TriangleAlert} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useEndpoint} from '../../core/useEndpoint'
import {$FeatureFixtureTallyLoad} from '../../endpoints/Feature'
import {$FixtureUpdate} from '../../endpoints/Fixture'
import {Loading, TeamName, fmtDate} from '../shared'
import './ladder.css'

type TGame = TFixture['games'][number]

const reportOf = (reports: TReport[], teamId: string, againstId: string) =>
  reports.find((r) => r.teamId === teamId && r.teamAgainstId === againstId)

/** Score each side reported for a game: averaged when both teams reported. */
export const reportedScores = (reports: TReport[], game: TGame) => {
  const r1 = reportOf(reports, game.team1Id, game.team2Id)
  const r2 = reportOf(reports, game.team2Id, game.team1Id)
  if (r1 && r2)
    return {
      team1: Math.round((r1.scoreFor + r2.scoreAgainst) / 2),
      team2: Math.round((r1.scoreAgainst + r2.scoreFor) / 2),
    }
  if (r1) return {team1: r1.scoreFor, team2: r1.scoreAgainst}
  if (r2) return {team1: r2.scoreAgainst, team2: r2.scoreFor}
  return undefined
}

/** Admin: record a fixture's official scores alongside the reports teams submitted. */
export function TallyDialog({
  fixture,
  onClose,
  onSaved,
}: {
  fixture?: TFixture
  onClose: () => void
  onSaved: () => void
}) {
  const $tallyLoad = useEndpoint($FeatureFixtureTallyLoad)
  const $fixtureUpdate = useEndpoint($FixtureUpdate)
  const [games, gamesSet] = useState<TGame[]>([])
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()

  useEffect(() => {
    if (!fixture) return
    gamesSet(fixture.games.map((g) => ({...g})))
    teamsSet(undefined)
    reportsSet(undefined)
    let live = true
    $tallyLoad
      .fetch({fixtureId: fixture.id})
      .then((data) => {
        if (!live) return
        teamsSet(data.teams)
        reportsSet(data.reports)
        if (!data.teams.length || !data.reports.length) return
        gamesSet((gs) =>
          gs.map((g) => {
            const reported = reportedScores(data.reports, g)
            // legacy behaviour: only fill scores that aren't already set
            return {
              ...g,
              team1Score: g.team1Score || reported?.team1,
              team2Score: g.team2Score || reported?.team2,
            }
          }),
        )
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture?.id])

  const teamById = (id: string) => teams?.find((t) => t.id === id)
  const patch = (id: string, data: Partial<TGame>) =>
    gamesSet((gs) => gs.map((g) => (g.id === id ? {...g, ...data} : g)))

  const mismatch = (game: TGame, side: 'team1' | 'team2') => {
    const reported = reports ? reportedScores(reports, game) : undefined
    const value = side === 'team1' ? game.team1Score : game.team2Score
    return (
      value !== undefined && reported !== undefined && value !== reported[side]
    )
  }

  const disagrees = (r: TReport) => {
    const g = games.find(
      (x) =>
        (x.team1Id === r.teamId && x.team2Id === r.teamAgainstId) ||
        (x.team2Id === r.teamId && x.team1Id === r.teamAgainstId),
    )
    if (!g || g.team1Score === undefined || g.team2Score === undefined)
      return false
    const [f, a] =
      g.team1Id === r.teamId
        ? [g.team1Score, g.team2Score]
        : [g.team2Score, g.team1Score]
    return f !== r.scoreFor || a !== r.scoreAgainst
  }

  const missing = (teams ?? []).length
    ? games.flatMap((g) => {
        const out: TTeam[] = []
        const t1 = teamById(g.team1Id)
        const t2 = teamById(g.team2Id)
        if (t1 && !reportOf(reports ?? [], g.team1Id, g.team2Id)) out.push(t1)
        if (t2 && !reportOf(reports ?? [], g.team2Id, g.team1Id)) out.push(t2)
        return out
      })
    : []

  const anyMismatch = games.some(
    (g) => mismatch(g, 'team1') || mismatch(g, 'team2'),
  )

  const save = () => {
    if (!fixture) return
    $fixtureUpdate
      .fetch({
        fixtureId: fixture.id,
        title: fixture.title,
        date: fixture.date,
        grading: fixture.grading,
        games,
      })
      .then(() => {
        toast.success(`${fixture.title} results saved`, {
          description: 'The ladder has been updated.',
        })
        onSaved()
      })
      .catch(() => undefined)
  }

  const loaded = teams !== undefined && reports !== undefined

  return (
    <Dialog
      open={!!fixture}
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      title={fixture ? `${fixture.title} results` : ''}
      description={fixture && fmtDate(fixture.date)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={$fixtureUpdate.loading}
            disabled={!loaded}
            onClick={save}
          >
            Save results
          </Button>
        </>
      }
    >
      {!loaded ? (
        <Loading />
      ) : (
        <div className="fr-tally">
          <Stack gap={2}>
            <Text size="sm" weight="medium">
              Results
            </Text>
            {games.length ? (
              <div className="fr-tally__games">
                {games.map((g) => {
                  const t1 = teamById(g.team1Id)
                  const t2 = teamById(g.team2Id)
                  return (
                    <div key={g.id} className="fr-tally__game">
                      <TeamName team={t1} />
                      <NumberInput
                        aria-label={`${t1?.name ?? 'Team 1'} score`}
                        variant="inline"
                        size="sm"
                        min={0}
                        placeholder="–"
                        invalid={mismatch(g, 'team1')}
                        value={g.team1Score ?? null}
                        onValueChange={(v) =>
                          patch(g.id, {team1Score: v ?? undefined})
                        }
                      />
                      <NumberInput
                        aria-label={`${t2?.name ?? 'Team 2'} score`}
                        variant="inline"
                        size="sm"
                        min={0}
                        placeholder="–"
                        invalid={mismatch(g, 'team2')}
                        value={g.team2Score ?? null}
                        onValueChange={(v) =>
                          patch(g.id, {team2Score: v ?? undefined})
                        }
                      />
                      <TeamName team={t2} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <Text size="sm" tone="tertiary">
                This fixture has no games.
              </Text>
            )}
            {anyMismatch && (
              <Alert tone="warning" icon={<TriangleAlert />}>
                Highlighted scores differ from what the teams reported.
              </Alert>
            )}
          </Stack>
          <Stack gap={4}>
            <Stack gap={2}>
              <Text size="sm" weight="medium">
                Submitted reports{' '}
                <Text as="span" size="sm" tone="tertiary">
                  · {reports.length}
                </Text>
              </Text>
              <DataTable<TReport>
                density="compact"
                rowKey={(r) => r.id}
                rows={reports}
                empty={
                  <Text size="sm" tone="tertiary">
                    No reports yet.
                  </Text>
                }
                columns={[
                  {
                    key: 'index',
                    header: '#',
                    width: 40,
                    render: (_r, i) => (
                      <Text as="span" size="sm" tone="tertiary">
                        {reports.length - i}
                      </Text>
                    ),
                  },
                  {
                    key: 'team1',
                    header: 'Team 1',
                    render: (r) => (
                      <TeamName team={teamById(r.teamId)} short />
                    ),
                  },
                  {
                    key: 'score',
                    header: 'Score',
                    render: (r) => (
                      <span className="fr-ladder-tally-score">
                        <span className="fr-num">
                          {r.scoreFor}–{r.scoreAgainst}
                        </span>
                        {disagrees(r) && (
                          <Tooltip content="Doesn’t match the recorded result">
                            <span
                              className="fr-warn"
                              tabIndex={0}
                              aria-label="Doesn’t match the recorded result"
                            >
                              <TriangleAlert />
                            </span>
                          </Tooltip>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'team2',
                    header: 'Team 2',
                    render: (r) => (
                      <TeamName team={teamById(r.teamAgainstId)} short />
                    ),
                  },
                ]}
              />
            </Stack>
            <Stack gap={2}>
              <Text size="sm" weight="medium">
                Missing reports
              </Text>
              {missing.length ? (
                <div className="fr-chips">
                  {missing.map((t, i) => (
                    <Badge
                      key={`${t.id}-${i}`}
                      variant="outline"
                      tone="warning"
                    >
                      {t.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Badge tone="success" icon={<CircleCheck />}>
                  All teams have submitted reports
                </Badge>
              )}
            </Stack>
          </Stack>
        </div>
      )}
    </Dialog>
  )
}
