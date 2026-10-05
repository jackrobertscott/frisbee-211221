import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {Document} from 'mongodb'
import {describe, expect, it} from 'vitest'
import {
  getMvpLeaderboardPipeline,
  TMvpLeaderboardRow,
  toMvpRows,
} from './mvpLeaderboard'

const now = new Date(0).toISOString()
const season: TSeason = {
  id: 's',
  createdOn: now,
  updatedOn: now,
  name: 'Season',
  signUpOpen: false,
}
const team: TTeam = {
  id: 't',
  createdOn: now,
  updatedOn: now,
  seasonId: 's',
  name: 'Team',
  color: 'hsla(0, 50%, 50%, 1)',
  division: 2,
}
const user = (id: string, gender: TUserPublic['gender']): TUserPublic => ({
  id,
  createdOn: now,
  updatedOn: now,
  firstName: 'First',
  lastName: id,
  gender,
})
const row = (
  userId: string,
  votes: number,
  maleVotes: number,
  femaleVotes: number,
): TMvpLeaderboardRow => ({userId, votes, maleVotes, femaleVotes, teamId: 't'})

const stage = (pipeline: Document[], name: string) =>
  pipeline.find((item) => name in item)

describe('getMvpLeaderboardPipeline', () => {
  it('weights second picks only under official scoring', () => {
    const casual = getMvpLeaderboardPipeline(['f'], season)
    const official = getMvpLeaderboardPipeline(['f'], {
      ...season,
      useOfficialScoring: true,
    })
    const points = (pipeline: Document[]) =>
      stage(pipeline, '$project')?.$project.votes.$filter.input.map(
        (vote: Document) => vote.points,
      )
    expect(points(casual)).toEqual([1, 0, 1, 0])
    expect(points(official)).toEqual([5, 3, 5, 3])
  })

  it('only counts slots the season uses', () => {
    const pipeline = getMvpLeaderboardPipeline(['f'], {
      ...season,
      genderDivision: 'men',
    })
    const input = stage(pipeline, '$project')?.$project.votes.$filter.input
    expect(input.map((vote: Document) => vote.userId)).toEqual([
      '$mvpMale',
      '$mvpMale2',
    ])
  })

  it('sorts by votes, division and player name, never id', () => {
    expect(stage(getMvpLeaderboardPipeline([], season), '$sort')).toEqual({
      $sort: {
        votes: -1,
        _sortDivisionMissing: 1,
        _sortDivision: 1,
        _sortUserName: 1,
      },
    })
  })
})

describe('toMvpRows', () => {
  it('names players, attaches teams and keeps aggregate order', () => {
    const rows = toMvpRows({
      aggregateRows: [row('b', 5, 5, 0), row('a', 3, 0, 3)],
      season,
      teams: [team],
      users: [user('a', 'female'), user('b', 'male')],
    })
    expect(rows).toEqual([
      {
        userId: 'b',
        userName: 'First b',
        teamId: 't',
        teamName: 'Team',
        division: 2,
        votes: 5,
        gender: 0,
      },
      {
        userId: 'a',
        userName: 'First a',
        teamId: 't',
        teamName: 'Team',
        division: 2,
        votes: 3,
        gender: 1,
      },
    ])
  })

  it('falls back to the slot with more votes and drops unused slots', () => {
    const rows = toMvpRows({
      aggregateRows: [
        row('unknown', 4, 3, 1),
        row('other', 2, 0, 2),
        row('zero', 0, 0, 0),
      ],
      season: {...season, genderDivision: 'women'},
      teams: [],
      users: [user('other', 'other')],
    })
    expect(
      rows.map((item) => [item.userId, item.userName, item.gender]),
    ).toEqual([['other', 'First other', 1]])
  })
})
