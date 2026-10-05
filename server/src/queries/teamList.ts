import {TSortDirection} from '@shared/utils/endpointDef'
import {TTeamListSortKey} from '@shared/endpoints/TeamDef'
import {Document} from 'mongodb'

export const TEAM_LIST_DEFAULT_SORT_BY: TTeamListSortKey = 'division'
export const TEAM_LIST_DEFAULT_SORT_DIRECTION: TSortDirection = 'asc'

/**
 * Teams matching `query`, sorted in the database before any paging. Division
 * sorts keep teams without a division last regardless of direction.
 */
export function getTeamListPipeline(
  query: Document,
  sortBy: TTeamListSortKey,
  sortDirection: TSortDirection,
  skip?: number,
  limit?: number,
): Document[] {
  const pipeline: Document[] = [{$match: query}]
  if (sortBy === 'division') {
    pipeline.push({
      $addFields: {
        _sortDivisionMissing: {
          $in: [{$type: '$division'}, ['missing', 'null']],
        },
      },
    })
  }
  pipeline.push({$sort: getTeamListSort(sortBy, sortDirection)})
  if (skip && skip > 0) pipeline.push({$skip: skip})
  if (limit !== undefined) pipeline.push({$limit: limit})
  if (sortBy === 'division')
    pipeline.push({$project: {_sortDivisionMissing: 0}})
  return pipeline
}

/** Every team in a season in the default (division) order. */
export function getSeasonTeamsPipeline(seasonId: string): Document[] {
  return getTeamListPipeline({seasonId}, 'division', 'asc')
}

function getTeamListSort(
  sortBy: TTeamListSortKey,
  sortDirection: TSortDirection,
): Record<string, 1 | -1> {
  const direction: 1 | -1 = sortDirection === 'asc' ? 1 : -1
  switch (sortBy) {
    case 'name':
      return {name: direction}
    case 'division':
      return {_sortDivisionMissing: 1, division: direction, name: 1}
    case 'phone':
      return {phone: direction, name: 1}
    case 'email':
      return {email: direction, name: 1}
    case 'createdOn':
      return {createdOn: direction}
  }
}
