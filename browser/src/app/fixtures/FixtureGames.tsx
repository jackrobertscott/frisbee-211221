import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {DataTable, Text, cx, type Column} from '@ui'
import {TeamName} from '../shared'
import './fixtures.css'

export type TFixtureGame = TFixture['games'][number]

export const compareGameSlot = (
  a: {time?: string; place?: string},
  b: {time?: string; place?: string},
) => {
  const time = (a.time ?? '').localeCompare(b.time ?? '')
  if (time) return time
  return (a.place ?? '').localeCompare(b.place ?? '')
}

const hasScore = (g: TFixtureGame) =>
  typeof g.team1Score === 'number' && typeof g.team2Score === 'number'

/**
 * Games of one fixture, ordered by slot: a table on wide screens, stacked matchups on phones
 * (a five-column table cannot fit there). The signed-in user's team games stand out.
 */
export function FixtureGames({
  fixture,
  teams,
  myTeamId,
  size = 'sm',
  bordered = false,
}: {
  fixture: TFixture
  teams: TTeam[]
  myTeamId?: string
  size?: 'sm' | 'md'
  /** Frame the games on their own (outside a card). */
  bordered?: boolean
}) {
  const teamById = (id: string) => teams.find((t) => t.id === id)
  const games = [...fixture.games].sort(compareGameSlot)
  const scored = games.some(hasScore)
  const muted = (g: TFixtureGame) =>
    !!myTeamId && g.team1Id !== myTeamId && g.team2Id !== myTeamId
  const team = (g: TFixtureGame, id: string) => (
    <TeamName team={teamById(id)} muted={muted(g)} size={size} />
  )
  if (!games.length)
    return (
      <Text size="sm" tone="tertiary" className="fr-pad">
        No games in this fixture yet.
      </Text>
    )
  const columns: Column<TFixtureGame>[] = [
    {key: 'team1', header: 'Team 1', render: (g) => team(g, g.team1Id)},
    ...(scored
      ? [
          {
            key: 'score',
            header: 'Score',
            align: 'center' as const,
            width: 90,
            render: (g: TFixtureGame) =>
              hasScore(g) ? (
                <Score a={g.team1Score} b={g.team2Score} />
              ) : (
                <Text as="span" size="sm" tone="tertiary">
                  –
                </Text>
              ),
          },
        ]
      : []),
    {key: 'team2', header: 'Team 2', render: (g) => team(g, g.team2Id)},
    {key: 'time', header: 'Time', width: 100},
    {key: 'place', header: 'Place', width: 110},
  ]
  return (
    <>
      <div className="fr-wide-only">
        <DataTable<TFixtureGame>
          bordered={bordered}
          density="compact"
          sortRows={false}
          rowKey={(g) => g.id}
          rows={games}
          columns={columns}
          aria-label={`${fixture.title} games`}
        />
      </div>
      <ul
        className={cx(
          'fr-matchups fr-narrow-only',
          bordered && 'fr-matchups--bordered',
        )}
        aria-label={`${fixture.title} games`}
      >
        {games.map((g) => {
          const slot = [g.time, g.place].filter(Boolean).join(' · ')
          const sides = [
            {id: g.team1Id, score: g.team1Score, other: g.team2Score},
            {id: g.team2Id, score: g.team2Score, other: g.team1Score},
          ]
          return (
            <li key={g.id} className="fr-matchup" data-size={size}>
              {slot && (
                <Text as="span" size="xs" tone="tertiary" className="fr-num">
                  {slot}
                </Text>
              )}
              {sides.map((side, i) => (
                <span key={i} className="fr-matchup__side">
                  {team(g, side.id)}
                  {hasScore(g) && (
                    <b
                      className="fr-matchup__score"
                      data-win={
                        (side.score ?? 0) > (side.other ?? 0) || undefined
                      }
                    >
                      {side.score}
                    </b>
                  )}
                </span>
              ))}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Score({a, b}: {a?: number; b?: number}) {
  return (
    <span className="fr-score">
      <b data-win={(a ?? 0) > (b ?? 0) || undefined}>{a}</b>
      <span>–</span>
      <b data-win={(b ?? 0) > (a ?? 0) || undefined}>{b}</b>
    </span>
  )
}
