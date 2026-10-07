import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {DataTable, Text, type Column} from '@ui'
import {TeamName} from '../common/TeamName'

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
  layout,
}: {
  fixture: TFixture
  teams: TTeam[]
  myTeamId?: string
  /** Shared by every fixture on the page so their columns line up. */
  layout: TFixtureLayout
}) {
  const teamById = (id: string) => teams.find((t) => t.id === id)
  const games = [...fixture.games].sort(compareGameSlot)
  const muted = (g: TFixtureGame) =>
    !!myTeamId && g.team1Id !== myTeamId && g.team2Id !== myTeamId
  if (!games.length)
    return (
      <Text size="sm" tone="tertiary" className="fr-pad">
        No games in this fixture yet.
      </Text>
    )
  const columns: Column<TFixtureGame>[] = [
    {key: 'time', header: 'Time', width: layout.timeWidth, nowrap: true},
    {key: 'place', header: 'Place', width: layout.placeWidth, nowrap: true},
    {
      key: 'team1',
      header: 'Team 1',
      render: (g) => <TeamName team={teamById(g.team1Id)} muted={muted(g)} wrap />,
    },
    {
      key: 'team2',
      header: 'Team 2',
      render: (g) => <TeamName team={teamById(g.team2Id)} muted={muted(g)} wrap />,
    },
  ]
  return (
    <DataTable<TFixtureGame>
      bordered={false}
      density="compact"
      sortRows={false}
      rowKey={(g) => g.id}
      rows={games}
      columns={columns}
      className="fr-fx-games-table"
      aria-label={`${fixture.title} games`}
    />
  )
}

export type TFixtureLayout = {
  timeWidth: string
  placeWidth: string
}

/** Fits the time and place columns to the longest value (or header) across all fixtures. */
const slotWidth = (header: string, values: string[]) => {
  const chars = Math.max(header.length, ...values.map((v) => v.trim().length))
  return `calc(${chars + 1}ch + 2 * var(--_cell-px))`
}

export const fixtureLayout = (fixtures: TFixture[]): TFixtureLayout => {
  const games = fixtures.flatMap((f) => f.games)
  return {
    timeWidth: slotWidth('Time', games.map((g) => g.time)),
    placeWidth: slotWidth('Place', games.map((g) => g.place)),
  }
}
