import {describe, expect, it} from 'vitest'
import {getSeasonTeamsPipeline, getTeamListPipeline} from './teamList'

const stageNames = (pipeline: object[]) =>
  pipeline.map((stage) => Object.keys(stage)[0])

describe('getTeamListPipeline', () => {
  it('sorts before skipping and limiting', () => {
    const pipeline = getTeamListPipeline({seasonId: 's'}, 'name', 'desc', 10, 5)
    expect(pipeline).toEqual([
      {$match: {seasonId: 's'}},
      {$sort: {name: -1}},
      {$skip: 10},
      {$limit: 5},
    ])
  })

  it('keeps teams without a division last and tie-breaks by name', () => {
    const pipeline = getTeamListPipeline({}, 'division', 'desc', 0, 20)
    expect(stageNames(pipeline)).toEqual([
      '$match',
      '$addFields',
      '$sort',
      '$limit',
      '$project',
    ])
    expect(pipeline[2]).toEqual({
      $sort: {_sortDivisionMissing: 1, division: -1, name: 1},
    })
    expect(pipeline[4]).toEqual({$project: {_sortDivisionMissing: 0}})
  })

  it('uses domain fields with a name tie-breaker, never id', () => {
    for (const sortBy of ['phone', 'email'] as const) {
      const [, sort] = getTeamListPipeline({}, sortBy, 'asc')
      expect(sort).toEqual({$sort: {[sortBy]: 1, name: 1}})
    }
    const [, sort] = getTeamListPipeline({}, 'createdOn', 'asc')
    expect(sort).toEqual({$sort: {createdOn: 1}})
  })

  it('omits paging stages when not requested', () => {
    expect(stageNames(getTeamListPipeline({}, 'name', 'asc'))).toEqual([
      '$match',
      '$sort',
    ])
  })
})

describe('getSeasonTeamsPipeline', () => {
  it('lists the whole season by division', () => {
    expect(getSeasonTeamsPipeline('s')).toEqual(
      getTeamListPipeline({seasonId: 's'}, 'division', 'asc'),
    )
  })
})
