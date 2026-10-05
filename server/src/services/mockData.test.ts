import {describe, expect, it} from 'vitest'
import {regex} from '../utils/regex'
import {generateMockSeasonData, generateMockTeamNames} from './mockData'

describe('generateMockTeamNames', () => {
  it('returns the requested number of distinct names', () => {
    const names = generateMockTeamNames(30)
    expect(names).toHaveLength(30)
    expect(new Set(names).size).toBe(30)
  })

  it('suffixes a cycle number once the pool runs out', () => {
    const names = generateMockTeamNames(1100)
    expect(names).toHaveLength(1100)
    expect(new Set(names).size).toBe(1100)
    expect(names[names.length - 1]).toMatch(/ 2$/)
  })
})

describe('generateMockSeasonData', () => {
  it('creates mock teams, users and memberships for the season', () => {
    const {teams, users, members} = generateMockSeasonData('season', 3, 4)
    expect(teams).toHaveLength(3)
    expect(users).toHaveLength(12)
    expect(members).toHaveLength(12)
    for (const team of teams) {
      expect(team).toMatchObject({
        seasonId: 'season',
        isMock: true,
        division: 1,
      })
      expect(team.color).toMatch(regex.hsla())
      const teamMembers = members.filter((m) => m.teamId === team.id)
      expect(teamMembers).toHaveLength(4)
      expect(teamMembers.map((m) => m.captain)).toEqual([
        true,
        false,
        false,
        false,
      ])
    }
    for (const user of users) {
      expect(user.isMock).toBe(true)
      expect(user.emails).toHaveLength(1)
      expect(user.emails[0]).toMatchObject({verified: true, primary: true})
      expect(user.emails[0].value).toMatch(regex.email())
    }
    expect(new Set(members.map((m) => m.userId))).toEqual(
      new Set(users.map((u) => u.id)),
    )
  })

  it('creates nothing for zero teams', () => {
    expect(generateMockSeasonData('season', 0, 5)).toEqual({
      teams: [],
      users: [],
      members: [],
    })
  })
})
