import {TSortDirection} from '@shared/utils/endpointDef'
import {TUserListSortKey} from '@shared/endpoints/UserDef'
import {Document} from 'mongodb'
import {regex} from '@shared/utils/regex'

export const USER_LIST_DEFAULT_SORT_BY: TUserListSortKey = 'createdOn'
export const USER_LIST_DEFAULT_SORT_DIRECTION: TSortDirection = 'desc'

/** Users whose first name, last name or any email contains `search`. */
export function getUserListQuery(search: string = ''): Document {
  const regexSearch = regex.from(search)
  return {
    $or: [
      {firstName: regexSearch},
      {lastName: regexSearch},
      {'emails.value': regexSearch},
    ],
  }
}

/**
 * Users matching `query`, sorted in the database before any paging. Email
 * sorts use the primary email (or the first email when none is primary),
 * trimmed and lowercased.
 */
export function getUserListPipeline(
  query: Document,
  sortBy: TUserListSortKey,
  sortDirection: TSortDirection,
  skip?: number,
  limit?: number,
): Document[] {
  const pipeline: Document[] = [{$match: query}]
  if (sortBy === 'email')
    pipeline.push({$addFields: {_sortPrimaryEmail: SORT_PRIMARY_EMAIL}})
  pipeline.push({$sort: getUserListSort(sortBy, sortDirection)})
  if (skip && skip > 0) pipeline.push({$skip: skip})
  if (limit !== undefined) pipeline.push({$limit: limit})
  if (sortBy === 'email') pipeline.push({$project: {_sortPrimaryEmail: 0}})
  return pipeline
}

const SORT_PRIMARY_EMAIL: Document = {
  $toLower: {
    $trim: {
      input: {
        $let: {
          vars: {
            primaryEmails: {
              $map: {
                input: {
                  $filter: {
                    input: '$emails',
                    as: 'email',
                    cond: '$$email.primary',
                  },
                },
                as: 'email',
                in: '$$email.value',
              },
            },
            firstEmails: {
              $map: {
                input: {$slice: ['$emails', 1]},
                as: 'email',
                in: '$$email.value',
              },
            },
          },
          in: {
            $ifNull: [
              {$first: '$$primaryEmails'},
              {$ifNull: [{$first: '$$firstEmails'}, '']},
            ],
          },
        },
      },
    },
  },
}

function getUserListSort(
  sortBy: TUserListSortKey,
  sortDirection: TSortDirection,
): Record<string, 1 | -1> {
  const direction: 1 | -1 = sortDirection === 'asc' ? 1 : -1
  switch (sortBy) {
    case 'firstName':
      return {firstName: direction, lastName: 1}
    case 'lastName':
      return {lastName: direction, firstName: 1}
    case 'email':
      return {_sortPrimaryEmail: direction, lastName: 1, firstName: 1}
    case 'gender':
      return {gender: direction, lastName: 1, firstName: 1}
    case 'createdOn':
      return {createdOn: direction}
  }
}
