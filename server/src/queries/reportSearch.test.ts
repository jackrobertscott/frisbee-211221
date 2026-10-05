import {TSeason} from '@shared/schemas/ioSeason'
import {Document} from 'mongodb'
import {describe, expect, it} from 'vitest'
import {getReportSearchPipeline} from './reportSearch'

const now = new Date(0).toISOString()
const season: TSeason = {
  id: 's',
  createdOn: now,
  updatedOn: now,
  name: 'Season',
  signUpOpen: false,
  genderDivision: 'mixed',
}

const facetReports = (pipeline: Document[]): Document[] =>
  pipeline.find((stage) => stage.$facet)?.$facet.reports
const stageNames = (pipeline: Document[]) =>
  pipeline.map((stage) => Object.keys(stage)[0])

describe('getReportSearchPipeline', () => {
  it('pages newest first before joining when not searching', () => {
    const pipeline = getReportSearchPipeline({
      fixtureIds: ['f'],
      season,
      skip: 20,
      limit: 10,
    })
    expect(stageNames(pipeline)).toEqual(['$match', '$facet', '$project'])
    const names = stageNames(facetReports(pipeline))
    expect(names.slice(0, 4)).toEqual(['$sort', '$skip', '$limit', '$lookup'])
    expect(facetReports(pipeline)[0]).toEqual({$sort: {createdOn: -1}})
  })

  it('joins and filters before paging when searching', () => {
    const pipeline = getReportSearchPipeline({
      fixtureIds: ['f'],
      season,
      search: '  a.b  ',
      limit: 10,
    })
    const names = stageNames(pipeline)
    expect(names.indexOf('$lookup')).toBeLessThan(names.indexOf('$facet'))
    const searchMatch = pipeline[names.lastIndexOf('$match')]
    expect(searchMatch.$match.$or).toContainEqual({
      'team.name': {$regex: 'a\\.b', $options: 'i'},
    })
    expect(stageNames(facetReports(pipeline))).toEqual([
      '$sort',
      '$limit',
      '$project',
    ])
  })

  it('hides MVP fields for slots the season does not use', () => {
    const pipeline = getReportSearchPipeline({
      fixtureIds: [],
      season: {...season, genderDivision: 'women'},
    })
    const reports = facetReports(pipeline)
    const report = reports[reports.length - 1].$project.report
    expect(report.mvpMale).toBe('$$REMOVE')
    expect(report.mvpFemale).toEqual({$ifNull: ['$mvpFemale', '$$REMOVE']})
  })
})
