import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {DataTable, Text, type Column} from '@ui'
import {TeamName} from '../shared'

export type TFixtureGame = TFixture['games'][number]

export const compareGameSlot = (
  a: {time?: string; place?: string},
  b: {time?: string; place?: string},
) => {
  const time = (a.time ?? '').localeCompare(b.time ?? '')
  if (time) return time
  return (a.place ?? '').localeCompare(b.place ?? '')
}

/** Games of one fixture, ordered by slot; the signed-in user's team games stand out. */
export function FixtureGames({
  fixture,
  teams,
  myTeamId,
}: {
  fixture: TFixture
  teams: TTeam[]
  myTeamId?: string
}) {
  const teamById = (id: string) => teams.find((t) => t.id === id)
  const games = [...fixture.games].sort(compareGameSlot)
  const scored = games.some(
    (g) => typeof g.team1Score === 'number' && typeof g.team2Score === 'number',
  )
  const muted = (g: TFixtureGame) =>
    !!myTeamId && g.team1Id !== myTeamId && g.team2Id !== myTeamId
  if (!games.length)
    return (
      <Text size="sm" tone="tertiary" className="fr-pad">
        No games in this fixture yet.
      </Text>
    )
  const columns: Column<TFixtureGame>[] = [
    {
      key: 'team1',
      header: 'Team 1',
      render: (g) => <TeamName team={teamById(g.team1Id)} muted={muted(g)} />,
    },
    ...(scored
      ? [
          {
            key: 'score',
            header: 'Score',
            align: 'center' as const,
            width: 90,
            render: (g: TFixtureGame) =>
              typeof g.team1Score === 'number' &&
              typeof g.team2Score === 'number' ? (
                <Score a={g.team1Score} b={g.team2Score} />
              ) : (
                <Text as="span" size="sm" tone="tertiary">
                  –
                </Text>
              ),
          },
        ]
      : []),
    {
      key: 'team2',
      header: 'Team 2',
      render: (g) => <TeamName team={teamById(g.team2Id)} muted={muted(g)} />,
    },
    {key: 'time', header: 'Time', width: 100, nowrap: true},
    {key: 'place', header: 'Place', width: 110, nowrap: true},
  ]
  return (
    <DataTable<TFixtureGame>
      bordered={false}
      density="compact"
      sortRows={false}
      rowKey={(g) => g.id}
      rows={games}
      columns={columns}
      aria-label={`${fixture.title} games`}
    />
  )
}

function Score({a, b}: {a: number; b: number}) {
  return (
    <span className="fr-score">
      <b data-win={a > b || undefined}>{a}</b>
      <span>–</span>
      <b data-win={b > a || undefined}>{b}</b>
    </span>
  )
}
