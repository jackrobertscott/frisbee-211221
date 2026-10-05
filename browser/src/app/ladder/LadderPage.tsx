import {authPoint} from '@shared/auth/authAccess'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {
  BarChart,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Stack,
  Text,
} from '@ui'
import {Flag, ListOrdered, Medal, Pencil, Trophy} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {useLoad} from '../../core/hooks/useLoad'
import {$FeatureCompetitionLoad} from '../../core/endpoints/Feature'
import {
  byLadder,
  formatRatioPercent,
  scoreDistribution,
  tallyChart,
  type TTally,
  type TTallyChart,
} from './tally'
import {FinalResultsDialog} from './FinalResultsDialog'
import {TallyDialog} from './TallyDialog'
import './ladder.css'
import {MissingReportsButton} from '../reports/MissingReports'
import {FixtureRow} from '../common/FixtureRow'
import {Loading} from '../common/Loading'
import {TeamName} from '../common/TeamName'
import {fmtDate} from '../common/format'
import {useShell} from '../shell/ShellProvider'

type TGame = TFixture['games'][number]

export function LadderPage() {
  const auth = useAuth()
  const shell = useShell()
  const season = auth.season
  const $competitionLoad = useEndpoint($FeatureCompetitionLoad)
  const competition = useLoad(
    () =>
      season
        ? $competitionLoad.fetch({seasonId: season.id})
        : Promise.resolve({teams: [], fixtures: []}),
    [season?.id, shell.version],
  )
  const teams = competition.data?.teams ?? []
  const fixtures = competition.data?.fixtures
  const tally = useMemo(() => tallyChart(fixtures ?? []), [fixtures])
  const [open, openSet] = useState<string[]>([])
  const [editing, editingSet] = useState<TFixture>()
  const [finalsOpen, finalsOpenSet] = useState(false)
  const canSeason = auth.can(authPoint.seasonManage)
  const canFixture = auth.can(authPoint.fixtureManage)

  const divisions = useMemo(
    () =>
      teams
        .reduce<number[]>((all, t) => {
          if (typeof t.division === 'number' && !all.includes(t.division))
            all.push(t.division)
          return all
        }, [])
        .sort((a, b) => a - b),
    [teams],
  )
  const undivided = teams.filter((t) => typeof t.division !== 'number')
  const distribution = useMemo(
    () => scoreDistribution(fixtures ?? []),
    [fixtures],
  )

  if (!competition.data)
    return (
      <div className="fr-page">
        {competition.loading ? (
          <Loading />
        ) : (
          <EmptyState
            bordered
            icon={<ListOrdered />}
            title="Couldn’t load the ladder"
            actions={<Button onClick={competition.reload}>Try again</Button>}
          />
        )}
      </div>
    )

  const teamById = (id: string) => teams.find((t) => t.id === id)
  const finalResults = (season?.finalResults ?? []).filter(
    (r): r is {teamId: string; position: number} =>
      typeof r.position === 'number',
  )
  const finalsByDivision = divisions
    .map((division) => ({
      division,
      rows: finalResults
        .map((r) => ({...r, team: teamById(r.teamId)}))
        .filter((r) => r.team?.division === division)
        .sort((a, b) => a.position - b.position),
    }))
    .filter((d) => d.rows.length)

  return (
    <div className="fr-page">
      {season && canSeason && (
        <div className="fr-actions">
          <Button leading={<Trophy />} onClick={() => finalsOpenSet(true)}>
            Edit final results
          </Button>
          <MissingReportsButton seasonId={season.id} size="md" />
        </div>
      )}

      {finalsByDivision.length > 0 && (
        <Card>
          <CardHeader
            icon={<Trophy />}
            title="Final results"
            description={season?.name}
            divider
          />
          <div className="fr-finals">
            {finalsByDivision.map(({division, rows}) => (
              <div key={division} className="fr-finals__div">
                <Text
                  size="xs"
                  weight="medium"
                  tone="tertiary"
                  className="fr-eyebrow"
                >
                  Division {division}
                </Text>
                <ol className="fr-finals__list">
                  {rows.map((r) => (
                    <li key={r.teamId} data-place={r.position}>
                      <span
                        className="fr-finals__place"
                        aria-label={`Position ${r.position}`}
                      >
                        {r.position === 1 ? (
                          <Trophy aria-hidden />
                        ) : r.position <= 3 ? (
                          <Medal aria-hidden />
                        ) : (
                          r.position
                        )}
                      </span>
                      <TeamName team={r.team} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!teams.length ? (
        <EmptyState
          bordered
          icon={<ListOrdered />}
          title="No ladder yet"
          description="The ladder appears once teams have registered and the first results are in."
        />
      ) : (
        <>
          {divisions.map((division) => (
            <LadderCard
              key={division}
              title={`Division ${division}`}
              teams={teams.filter((t) => t.division === division)}
              tally={tally}
              myTeamId={auth.current?.team?.id}
            />
          ))}
          {undivided.length > 0 && (
            <LadderCard
              title={divisions.length ? 'No division' : 'Ladder'}
              teams={undivided}
              tally={tally}
              myTeamId={auth.current?.team?.id}
            />
          )}
        </>
      )}

      {!!fixtures?.length && (
        <Stack gap={2}>
          <Text as="h2" size="sm" weight="semibold" className="fr-subhead">
            Results by round
          </Text>
          {fixtures.map((f) => (
            <FixtureRow
              key={f.id}
              open={open.includes(f.id)}
              onToggle={() =>
                openSet((o) =>
                  o.includes(f.id) ? o.filter((x) => x !== f.id) : [...o, f.id],
                )
              }
              title={f.title}
              meta={fmtDate(f.date)}
              action={
                canFixture && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leading={<Pencil />}
                    onClick={() => editingSet(f)}
                  >
                    Edit results
                  </Button>
                )
              }
            >
              <ResultsTable fixture={f} teamById={teamById} />
            </FixtureRow>
          ))}
        </Stack>
      )}

      {fixtures && (
        <Card>
          <CardHeader
            title="All teams, all games"
            description="How often each points total was scored across every game"
          />
          <CardBody>
            {distribution.length ? (
              <BarChart
                aria-label="Occurrences of each points total scored"
                integer
                data={distribution}
                series={[{key: 'games', label: 'Occurrences'}]}
                xLabel="Points scored"
                yLabel="Occurrences"
                height={220}
              />
            ) : (
              <Text size="sm" tone="tertiary">
                No scores recorded yet.
              </Text>
            )}
          </CardBody>
        </Card>
      )}

      {season && canSeason && (
        <FinalResultsDialog
          open={finalsOpen}
          onOpenChange={finalsOpenSet}
          season={season}
          teams={teams}
          divisions={divisions}
          onSaved={(updated) => {
            auth.seasonSet(updated, true)
            finalsOpenSet(false)
          }}
        />
      )}
      {canFixture && (
        <TallyDialog
          fixture={editing}
          onClose={() => editingSet(undefined)}
          onSaved={() => {
            editingSet(undefined)
            competition.reload()
          }}
        />
      )}
    </div>
  )
}

const Num = ({value}: {value: number | string | undefined}) =>
  value === undefined ? (
    <span className="fr-ladder-dash">–</span>
  ) : (
    <span className="fr-num">{value}</span>
  )

function LadderCard({
  title,
  teams,
  tally,
  myTeamId,
}: {
  title: string
  teams: TTeam[]
  tally: TTally
  myTeamId?: string
}) {
  const rows = [...teams].sort(byLadder(tally))
  const n = (pick: (t: TTallyChart) => number) => (team: TTeam) => {
    const t = tally[team.id]
    return <Num value={t ? pick(t) : undefined} />
  }
  return (
    <Card>
      <CardHeader
        icon={<Flag />}
        title={title}
        description={`${teams.length} teams · win 4, draw 2, loss 0`}
        divider
      />
      <DataTable<TTeam>
        bordered={false}
        density="compact"
        rowKey={(t) => t.id}
        rows={rows}
        defaultSort={null}
        columns={[
          {
            key: 'rank',
            header: '#',
            width: 40,
            render: (_t, i) => (
              <Text as="span" size="sm" tone="tertiary">
                {i + 1}
              </Text>
            ),
          },
          {
            key: 'name',
            header: 'Team',
            render: (t) => (
              <span
                className={
                  t.id === myTeamId ? 'fr-mine fr-ladder-team' : 'fr-ladder-team'
                }
              >
                <TeamName team={t} />
              </span>
            ),
          },
          {key: 'games', header: 'Games', align: 'right', render: n((t) => t.games)},
          {
            key: 'points',
            header: 'Points',
            align: 'right',
            render: (team) => (
              <b className="fr-ladder-pts">
                <Num value={tally[team.id]?.points} />
              </b>
            ),
          },
          {key: 'wins', header: 'Wins', align: 'right', render: n((t) => t.wins)},
          {key: 'loses', header: 'Losses', align: 'right', render: n((t) => t.loses)},
          {key: 'draws', header: 'Draws', align: 'right', render: n((t) => t.draws)},
          {
            key: 'ratio',
            header: 'Ratio',
            align: 'right',
            render: (team) => (
              <Num value={formatRatioPercent(tally[team.id]?.ratio)} />
            ),
          },
          {key: 'for', header: 'For', align: 'right', render: n((t) => t.for)},
          {key: 'against', header: 'Agst', align: 'right', render: n((t) => t.against)},
          {key: 'aveFor', header: 'Avg for', align: 'right', render: n((t) => t.aveFor)},
          {
            key: 'aveAgainst',
            header: 'Avg agst',
            align: 'right',
            render: n((t) => t.aveAgainst),
          },
        ]}
      />
    </Card>
  )
}

function ResultsTable({
  fixture,
  teamById,
}: {
  fixture: TFixture
  teamById: (id: string) => TTeam | undefined
}) {
  if (!fixture.games.length)
    return (
      <Text size="sm" tone="tertiary" className="fr-ladder-games-empty">
        No games in this round.
      </Text>
    )
  const team = (id: string) => {
    const t = teamById(id)
    return (
      <>
        <span className="fr-ladder-full">
          <TeamName team={t} />
        </span>
        <span className="fr-ladder-short">
          <TeamName team={t} short />
        </span>
      </>
    )
  }
  return (
    <DataTable<TGame>
      bordered={false}
      density="compact"
      rowKey={(g) => g.id}
      rows={fixture.games}
      columns={[
        {key: 'team1', header: 'Team 1', render: (g) => team(g.team1Id)},
        {
          key: 'team1Score',
          header: 'Score',
          align: 'right',
          width: 72,
          render: (g) => <Num value={g.team1Score} />,
        },
        {key: 'team2', header: 'Team 2', render: (g) => team(g.team2Id)},
        {
          key: 'team2Score',
          header: 'Score',
          align: 'right',
          width: 72,
          render: (g) => <Num value={g.team2Score} />,
        },
      ]}
    />
  )
}
