import {describe, expect, it} from 'vitest'
import {getUserListPipeline, getUserListQuery} from './userList'

describe('getUserListQuery', () => {
  it('matches the search case-insensitively on names and emails', () => {
    const query = getUserListQuery('a.b')
    expect(query.$or).toHaveLength(3)
    const [firstName] = query.$or
    expect(firstName.firstName).toEqual(/a\.b/i)
  })

  it('matches everything for an empty search', () => {
    expect(getUserListQuery().$or[0].firstName.test('anything')).toBe(true)
  })
})

describe('getUserListPipeline', () => {
  it('sorts before skipping and limiting', () => {
    expect(getUserListPipeline({}, 'createdOn', 'desc', 10, 5)).toEqual([
      {$match: {}},
      {$sort: {createdOn: -1}},
      {$skip: 10},
      {$limit: 5},
    ])
  })

  it('omits a zero skip and a missing limit', () => {
    expect(getUserListPipeline({}, 'firstName', 'asc', 0)).toEqual([
      {$match: {}},
      {$sort: {firstName: 1, lastName: 1}},
    ])
  })

  it('breaks name ties on the other name', () => {
    expect(getUserListPipeline({}, 'lastName', 'desc')[1]).toEqual({
      $sort: {lastName: -1, firstName: 1},
    })
    expect(getUserListPipeline({}, 'genderMatching', 'asc')[1]).toEqual({
      $sort: {genderMatching: 1, lastName: 1, firstName: 1},
    })
  })

  it('adds and then removes the primary email sort field', () => {
    const pipeline = getUserListPipeline({}, 'email', 'asc', 0, 20)
    expect(Object.keys(pipeline[1].$addFields)).toEqual(['_sortPrimaryEmail'])
    expect(pipeline[2]).toEqual({
      $sort: {_sortPrimaryEmail: 1, lastName: 1, firstName: 1},
    })
    expect(pipeline[3]).toEqual({$limit: 20})
    expect(pipeline[4]).toEqual({$project: {_sortPrimaryEmail: 0}})
  })
})
