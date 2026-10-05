import {Document} from 'mongodb'

export type TSpiritTeamTotal = {
  _id: string
  spirit: number
  reports: number
}

export type TSpiritReportScore = {
  teamId: string
  teamAgainstId: string
  spirit: number
}

export type TSpiritTableAggregate = {
  received?: TSpiritTeamTotal[]
  allocated?: TSpiritTeamTotal[]
  reports?: TSpiritReportScore[]
}

/**
 * Spirit totals across the given fixtures as one document: totals per team
 * received and allocated, plus every report's score for the bias adjustment.
 * Official scoring sums the five spirit categories.
 */
export function getSpiritTablePipeline(
  fixtureIds: string[],
  useOfficialScoring: boolean,
): Document[] {
  const spiritExpression = useOfficialScoring
    ? {
        $add: [
          {$ifNull: ['$spiritP1', 0]},
          {$ifNull: ['$spiritP2', 0]},
          {$ifNull: ['$spiritP3', 0]},
          {$ifNull: ['$spiritP4', 0]},
          {$ifNull: ['$spiritP5', 0]},
        ],
      }
    : {$ifNull: ['$spirit', 0]}
  const totalsBy = (teamField: string): Document[] => [
    {
      $group: {
        _id: teamField,
        spirit: {$sum: '$spiritTotal'},
        reports: {$sum: 1},
      },
    },
  ]
  return [
    {$match: {fixtureId: {$in: fixtureIds}}},
    {$addFields: {spiritTotal: spiritExpression}},
    {
      $facet: {
        received: totalsBy('$teamAgainstId'),
        allocated: totalsBy('$teamId'),
        reports: [
          {
            $project: {
              _id: 0,
              teamId: '$teamId',
              teamAgainstId: '$teamAgainstId',
              spirit: '$spiritTotal',
            },
          },
        ],
      },
    },
  ]
}
