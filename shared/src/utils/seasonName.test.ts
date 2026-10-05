import {describe, expect, it} from 'vitest'
import {compareSeasonNames, seasonNameCollation} from './seasonName'

describe('compareSeasonNames', () => {
  it('orders numbers numerically', () => {
    expect(
      ['Season 10', 'Season 2', 'Season 1'].sort(compareSeasonNames),
    ).toEqual(['Season 1', 'Season 2', 'Season 10'])
  })

  it('ignores case and accents', () => {
    expect(compareSeasonNames('summer', 'SUMMER')).toBe(0)
    expect(compareSeasonNames('Été', 'ete')).toBe(0)
  })

  it('orders alphabetically', () => {
    expect(compareSeasonNames('Autumn 2024', 'Winter 2023')).toBeLessThan(0)
    expect(compareSeasonNames('2025 Winter', '2024 Winter')).toBeGreaterThan(0)
  })

  it('treats null and undefined as empty strings and stringifies others', () => {
    expect(compareSeasonNames(undefined, '')).toBe(0)
    expect(compareSeasonNames(null, 'a')).toBeLessThan(0)
    expect(compareSeasonNames(10, 9)).toBeGreaterThan(0)
  })

  it('exposes matching mongo collation options', () => {
    expect(seasonNameCollation).toEqual({
      locale: 'en',
      numericOrdering: true,
      strength: 1,
    })
  })
})
