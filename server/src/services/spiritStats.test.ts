import {TFeatureSpiritRow} from '@shared/endpoints/FeatureDef'
import {TTeam} from '@shared/schemas/ioTeam'
import {describe, expect, it} from 'vitest'
import {
  buildSpiritRows,
  getAdjustedSpiritAverages,
  sortSpiritRows,
} from './spiritStats'

const now = new Date(0).toISOString()
const team = (id: string, name: string, division?: number): TTeam => ({
  id,
  createdOn: now,
  updatedOn: now,
  seasonId: 's',
  name,
  color: 'hsla(0, 50%, 50%, 1)',
  division,
})

describe('getAdjustedSpiritAverages', () => {
  it('leaves scores alone when every scorer matches the overall average', () => {
    const {receivedAverageMap, allocatedAverageMap} = getAdjustedSpiritAverages(
      [
        {teamId: 'a', teamAgainstId: 'b', spirit: 10},
        {teamId: 'b', teamAgainstId: 'a', spirit: 10},
      ],
    )
    expect(receivedAverageMap.get('a')).toBe(10)
    expect(allocatedAverageMap.get('b')).toBe(10)
  })

  it('removes a shrunken share of each scorer bias', () => {
    // a scores 14, b scores 10: overall 12, each bias is 2 shrunk by 1/(1+3)
    const {receivedAverageMap, allocatedAverageMap} = getAdjustedSpiritAverages(
      [
        {teamId: 'a', teamAgainstId: 'b', spirit: 14},
        {teamId: 'b', teamAgainstId: 'a', spirit: 10},
      ],
    )
    expect(receivedAverageMap.get('b')).toBeCloseTo(13.5)
    expect(receivedAverageMap.get('a')).toBeCloseTo(10.5)
    expect(allocatedAverageMap.get('a')).toBeCloseTo(13.5)
  })

  it('handles no reports', () => {
    const result = getAdjustedSpiritAverages([])
    expect(result.receivedAverageMap.size).toBe(0)
  })
})

describe('buildSpiritRows', () => {
  it('builds a row per team with zeros for teams without reports', () => {
    const rows = buildSpiritRows(
      [team('a', 'A'), team('b', 'B'), team('c', 'C')],
      {
        received: [
          {_id: 'a', spirit: 20, reports: 2},
          {_id: 'b', spirit: 12, reports: 1},
        ],
        allocated: [{_id: 'a', spirit: 12, reports: 1}],
        reports: [
          {teamId: 'a', teamAgainstId: 'b', spirit: 12},
          {teamId: 'b', teamAgainstId: 'a', spirit: 10},
          {teamId: 'b', teamAgainstId: 'a', spirit: 10},
        ],
      },
    )
    expect(rows.map((row) => row.team.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0]).toMatchObject({
      receivedAverage: 10,
      allocatedAverage: 12,
      averageDifference: 2,
    })
    // b has only been scored, so differences stay zero
    expect(rows[1]).toMatchObject({averageDifference: 0, adjustedDifference: 0})
    expect(rows[2]).toMatchObject({
      receivedSpirit: 0,
      receivedReports: 0,
      adjustedReceivedAverage: 0,
    })
  })

  it('accepts a missing aggregate', () => {
    expect(
      buildSpiritRows([team('a', 'A')], undefined)[0].receivedAverage,
    ).toBe(0)
  })
})

describe('sortSpiritRows', () => {
  const rows: TFeatureSpiritRow[] = [
    team('a', 'Bravo', 2),
    team('b', 'Alpha'),
    team('c', 'Charlie', 1),
    team('d', 'Delta', 2),
  ].map((item, index) => ({
    ...buildSpiritRows([item], undefined)[0],
    receivedSpirit: index,
  }))
  const names = (sorted: TFeatureSpiritRow[]) =>
    sorted.map((row) => row.team.name)

  it('sorts by team name', () => {
    expect(names(sortSpiritRows(rows, 'team', 'desc'))).toEqual([
      'Delta',
      'Charlie',
      'Bravo',
      'Alpha',
    ])
  })

  it('keeps missing divisions last and names ascending within a division', () => {
    expect(names(sortSpiritRows(rows, 'division', 'desc'))).toEqual([
      'Bravo',
      'Delta',
      'Charlie',
      'Alpha',
    ])
  })

  it('sorts numeric columns without mutating the input', () => {
    expect(names(sortSpiritRows(rows, 'receivedSpirit', 'desc'))).toEqual([
      'Delta',
      'Charlie',
      'Alpha',
      'Bravo',
    ])
    expect(names(rows)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta'])
  })
})
