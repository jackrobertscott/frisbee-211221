import {TReportSearchRow} from '@shared/endpoints/ReportDef'
import {TSeason} from '@shared/schemas/ioSeason'
import {getSeasonMvpSlots} from '@shared/utils/seasonGenderDivision'
import {Document} from 'mongodb'
import {$Fixture} from '../tables/$Fixture'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {regex} from '../utils/regex'

export type TReportSearchResult = {
  count: number
  reports: TReportSearchRow[]
}

/**
 * One page of a season's reports, newest first, with the fixture, team and
 * submitter names joined in. Produces a single `{count, reports}` document.
 */
export function getReportSearchPipeline({
  fixtureIds,
  season,
  search,
  limit,
  skip,
}: {
  fixtureIds: string[]
  season: TSeason
  search?: string
  limit?: number
  skip?: number
}): Document[] {
  const trimmedSearch = search?.trim()
  const lookups = getReportRowLookups()
  const pipeline: Document[] = [{$match: {fixtureId: {$in: fixtureIds}}}]

  // searching filters on joined fields, so join first; otherwise paginate
  // first and join only the rows on the requested page
  if (trimmedSearch) {
    const searchRegex = regex.escape(trimmedSearch)
    const matches = (field: string): Document => ({
      [field]: {$regex: searchRegex, $options: 'i'},
    })
    pipeline.push(...lookups, {
      $match: {
        $or: [
          matches('fixture.title'),
          matches('team.name'),
          matches('againstTeam.name'),
          matches('submitterName'),
          matches('userId'),
          matches('spiritComment'),
        ],
      },
    })
  }

  pipeline.push(
    {
      $facet: {
        meta: [{$count: 'count'}],
        reports: [
          {$sort: {createdOn: -1}},
          ...(skip ? [{$skip: skip}] : []),
          ...(limit !== undefined ? [{$limit: limit}] : []),
          ...(trimmedSearch ? [] : lookups),
          {$project: getReportRowProjection(season)},
        ],
      },
    },
    {
      $project: {
        count: {$ifNull: [{$arrayElemAt: ['$meta.count', 0]}, 0]},
        reports: '$reports',
      },
    },
  )

  return pipeline
}

// join only the fields the rows need, never whole user or team documents
function getReportRowLookups(): Document[] {
  const lookupTeam = (localField: string, as: string): Document[] => [
    {
      $lookup: {
        from: $Team.key(),
        localField,
        foreignField: 'id',
        pipeline: [{$project: {_id: 0, name: 1, color: 1}}],
        as,
      },
    },
    {$unwind: {path: `$${as}`, preserveNullAndEmptyArrays: true}},
  ]
  return [
    {
      $lookup: {
        from: $Fixture.key(),
        localField: 'fixtureId',
        foreignField: 'id',
        pipeline: [{$project: {_id: 0, title: 1}}],
        as: 'fixture',
      },
    },
    {$unwind: '$fixture'},
    ...lookupTeam('teamId', 'team'),
    ...lookupTeam('teamAgainstId', 'againstTeam'),
    {
      $lookup: {
        from: $User.key(),
        localField: 'userId',
        foreignField: 'id',
        pipeline: [{$project: {_id: 0, firstName: 1, lastName: 1}}],
        as: 'submitter',
      },
    },
    {$unwind: {path: '$submitter', preserveNullAndEmptyArrays: true}},
    {
      $addFields: {
        submitterName: {
          $trim: {
            input: {
              $concat: [
                {$ifNull: ['$submitter.firstName', '']},
                ' ',
                {$ifNull: ['$submitter.lastName', '']},
              ],
            },
          },
        },
      },
    },
  ]
}

// MVP fields are hidden for slots the season does not use
function getReportRowProjection(season: TSeason): Document {
  const slots = getSeasonMvpSlots(season)
  const optional = (field: string) => ({$ifNull: [`$${field}`, '$$REMOVE']})
  const optionalIf = (enabled: boolean, field: string) =>
    enabled ? optional(field) : '$$REMOVE'
  return {
    _id: 0,
    report: {
      id: '$id',
      createdOn: '$createdOn',
      updatedOn: '$updatedOn',
      teamId: '$teamId',
      teamAgainstId: '$teamAgainstId',
      fixtureId: '$fixtureId',
      userId: optional('userId'),
      scoreFor: '$scoreFor',
      scoreAgainst: '$scoreAgainst',
      mvpMale: optionalIf(slots.male, 'mvpMale'),
      mvpMale2: optionalIf(slots.male, 'mvpMale2'),
      mvpFemale: optionalIf(slots.female, 'mvpFemale'),
      mvpFemale2: optionalIf(slots.female, 'mvpFemale2'),
      spirit: optional('spirit'),
      spiritComment: '$spiritComment',
      spiritP1: optional('spiritP1'),
      spiritP2: optional('spiritP2'),
      spiritP3: optional('spiritP3'),
      spiritP4: optional('spiritP4'),
      spiritP5: optional('spiritP5'),
    },
    fixtureTitle: {$ifNull: ['$fixture.title', '$fixtureId']},
    teamName: {$ifNull: ['$team.name', '$teamId']},
    teamColor: optional('team.color'),
    againstName: {$ifNull: ['$againstTeam.name', '$teamAgainstId']},
    againstColor: optional('againstTeam.color'),
    submitterName: {
      $cond: [
        {$gt: [{$strLenCP: '$submitterName'}, 0]},
        '$submitterName',
        {$ifNull: ['$userId', '...']},
      ],
    },
  }
}
