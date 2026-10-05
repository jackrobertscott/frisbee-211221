import {TFixture} from '@shared/schemas/ioFixture'
import {describe, expect, it} from 'vitest'
import {listMissingReports, TSubmittedReport} from './missingReports'

const teams = [
  {id: 'A', name: 'Alpha', color: 'hsla(0, 50%, 50%, 1)'},
  {id: 'B', name: 'Bravo', color: 'hsla(90, 50%, 50%, 1)'},
  {id: 'C', name: 'Charlie', color: 'hsla(180, 50%, 50%, 1)'},
  {id: 'D', name: 'Delta', color: 'hsla(270, 50%, 50%, 1)'},
]

const fixture = (
  id: string,
  title: string,
  date: string,
  pairings: string[][],
): Pick<TFixture, 'id' | 'title' | 'date' | 'games'> => ({
  id,
  title,
  date,
  games: pairings.map(([team1Id, team2Id], index) => ({
    id: `${id}-${index}`,
    team1Id,
    team2Id,
    place: 'Field',
    time: '18:00',
  })),
})

const report = (
  fixtureId: string,
  teamId: string,
  teamAgainstId?: string,
): TSubmittedReport => ({fixtureId, teamId, teamAgainstId})

const missing = (id: string, againstId?: string) => {
  const team = teams.find((t) => t.id === id)!
  const against = teams.find((t) => t.id === againstId)
  return {
    id,
    name: team.name,
    color: team.color,
    againstId: against?.id,
    againstName: against?.name,
  }
}

describe('listMissingReports', () => {
  it('lists both sides of a game until each has reported', () => {
    const fixtures = [
      fixture('F1', 'Round 1', '2026-01-01', [
        ['A', 'B'],
        ['C', 'D'],
      ]),
    ]
    expect(
      listMissingReports(fixtures, teams, [
        report('F1', 'A', 'B'),
        report('F1', 'D', 'C'),
      ]),
    ).toEqual([
      {
        title: 'Round 1',
        fixtureId: 'F1',
        date: '2026-01-01',
        missingTeams: [missing('B', 'A'), missing('C', 'D')],
      },
    ])
  })

  it('only counts a report against the same opponent and fixture', () => {
    const fixtures = [fixture('F1', 'Round 1', '2026-01-01', [['A', 'B']])]
    const result = listMissingReports(fixtures, teams, [
      report('F1', 'A', 'C'),
      report('F2', 'B', 'A'),
    ])
    expect(result[0].missingTeams).toEqual([
      missing('A', 'B'),
      missing('B', 'A'),
    ])
  })

  it('drops rounds where everyone has reported', () => {
    const fixtures = [fixture('F1', 'Round 1', '2026-01-01', [['A', 'B']])]
    expect(
      listMissingReports(fixtures, teams, [
        report('F1', 'A', 'B'),
        report('F1', 'B', 'A'),
      ]),
    ).toEqual([])
  })

  it('skips unknown teams but still names a known opponent', () => {
    const fixtures = [fixture('F1', 'Round 1', '2026-01-01', [['A', 'X']])]
    expect(listMissingReports(fixtures, teams, [])[0].missingTeams).toEqual([
      missing('A'),
    ])
    expect(listMissingReports(fixtures, teams, [report('F1', 'A')])).toEqual([])
  })

  it('lists fixtures that share a title separately', () => {
    const fixtures = [
      fixture('F1', 'Round 1', '2026-01-01', [['A', 'B']]),
      fixture('F2', 'Round 1', '2026-01-08', [
        ['A', 'C'],
        ['C', 'D'],
      ]),
    ]
    expect(listMissingReports(fixtures, teams, [])).toEqual([
      {
        title: 'Round 1',
        fixtureId: 'F1',
        date: '2026-01-01',
        missingTeams: [missing('A', 'B'), missing('B', 'A')],
      },
      {
        title: 'Round 1',
        fixtureId: 'F2',
        date: '2026-01-08',
        // C appears once in a fixture even though it is missing two reports
        missingTeams: [missing('A', 'C'), missing('C', 'A'), missing('D', 'C')],
      },
    ])
  })

  it('orders rounds by date', () => {
    const fixtures = [
      fixture('F2', 'Round 2', '2026-01-08', [['A', 'B']]),
      fixture('F1', 'Round 1', '2026-01-01', [['C', 'D']]),
    ]
    expect(
      listMissingReports(fixtures, teams, []).map((round) => round.title),
    ).toEqual(['Round 1', 'Round 2'])
  })
})
