import {TSortDirection} from '@shared/utils/endpointDef'
import {
  TFeatureSpiritRow,
  TFeatureSpiritSortKey,
} from '@shared/endpoints/FeatureDef'
import {TTeam} from '@shared/schemas/ioTeam'
import {TSpiritReportScore, TSpiritTableAggregate} from '../queries/spiritTable'

const SPIRIT_SCORER_BIAS_SHRINKAGE_REPORTS = 3

type TSpiritStats = {
  spirit: number
  reports: number
}

export type TAdjustedSpiritAverages = {
  receivedAverageMap: Map<string, number>
  allocatedAverageMap: Map<string, number>
}

/**
 * Average spirit per team after removing each scoring team's bias: how far
 * its average score sits from the overall average, shrunk toward zero until
 * it has scored enough reports to trust.
 */
export function getAdjustedSpiritAverages(
  reports: TSpiritReportScore[],
): TAdjustedSpiritAverages {
  const globalAverage =
    reports.reduce((total, report) => total + report.spirit, 0) /
    (reports.length || 1)
  const scorerStatsMap = new Map<string, TSpiritStats>()
  for (const report of reports) {
    addSpiritStat(scorerStatsMap, report.teamId, report.spirit)
  }
  const scorerBiasMap = new Map<string, number>()
  for (const [teamId, stats] of scorerStatsMap) {
    // Pull scorer bias toward zero until there are enough reports to trust it.
    const confidence =
      stats.reports / (stats.reports + SPIRIT_SCORER_BIAS_SHRINKAGE_REPORTS)
    const average = stats.spirit / stats.reports
    scorerBiasMap.set(teamId, confidence * (average - globalAverage))
  }
  const receivedStatsMap = new Map<string, TSpiritStats>()
  const allocatedStatsMap = new Map<string, TSpiritStats>()
  for (const report of reports) {
    const adjustedSpirit =
      report.spirit - (scorerBiasMap.get(report.teamId) ?? 0)
    addSpiritStat(receivedStatsMap, report.teamAgainstId, adjustedSpirit)
    addSpiritStat(allocatedStatsMap, report.teamId, adjustedSpirit)
  }
  return {
    receivedAverageMap: getAverageMap(receivedStatsMap),
    allocatedAverageMap: getAverageMap(allocatedStatsMap),
  }
}

/** One spirit table row per team, in the order the teams are given. */
export function buildSpiritRows(
  teams: TTeam[],
  aggregate: TSpiritTableAggregate | undefined,
): TFeatureSpiritRow[] {
  const receivedMap = new Map(
    (aggregate?.received ?? []).map((row) => [row._id, row]),
  )
  const allocatedMap = new Map(
    (aggregate?.allocated ?? []).map((row) => [row._id, row]),
  )
  const adjusted = getAdjustedSpiritAverages(aggregate?.reports ?? [])
  return teams.map((team) => {
    const received = receivedMap.get(team.id)
    const allocated = allocatedMap.get(team.id)
    const receivedSpirit = received?.spirit ?? 0
    const receivedReports = received?.reports ?? 0
    const allocatedSpirit = allocated?.spirit ?? 0
    const allocatedReports = allocated?.reports ?? 0
    const receivedAverage =
      receivedReports > 0 ? receivedSpirit / receivedReports : 0
    const allocatedAverage =
      allocatedReports > 0 ? allocatedSpirit / allocatedReports : 0
    const adjustedReceivedAverage =
      adjusted.receivedAverageMap.get(team.id) ?? 0
    const adjustedAllocatedAverage =
      adjusted.allocatedAverageMap.get(team.id) ?? 0
    // differences only mean something once a team has both scored and been scored
    const hasBoth = receivedReports > 0 && allocatedReports > 0
    return {
      team,
      receivedSpirit,
      receivedReports,
      receivedAverage,
      adjustedReceivedAverage,
      allocatedSpirit,
      allocatedReports,
      allocatedAverage,
      adjustedAllocatedAverage,
      averageDifference: hasBoth ? allocatedAverage - receivedAverage : 0,
      adjustedDifference: hasBoth
        ? adjustedAllocatedAverage - adjustedReceivedAverage
        : 0,
    }
  })
}

/**
 * The spirit table is computed per request rather than stored, so it is
 * sorted here. Division sorts keep teams without a division last and break
 * ties by team name ascending.
 */
export function sortSpiritRows(
  rows: TFeatureSpiritRow[],
  sortBy: TFeatureSpiritSortKey,
  sortDirection: TSortDirection,
): TFeatureSpiritRow[] {
  const direction = sortDirection === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortBy === 'team') {
      return a.team.name.localeCompare(b.team.name) * direction
    }
    if (sortBy === 'division') {
      const aDivision = a.team.division
      const bDivision = b.team.division
      if (typeof aDivision !== 'number' && typeof bDivision !== 'number') {
        return a.team.name.localeCompare(b.team.name)
      }
      if (typeof aDivision !== 'number') return 1
      if (typeof bDivision !== 'number') return -1
      const divisionDiff = aDivision - bDivision
      if (divisionDiff !== 0) return divisionDiff * direction
      return a.team.name.localeCompare(b.team.name)
    }
    return (a[sortBy] - b[sortBy]) * direction
  })
}

function addSpiritStat(
  map: Map<string, TSpiritStats>,
  teamId: string,
  spirit: number,
) {
  const stats = map.get(teamId) ?? {spirit: 0, reports: 0}
  stats.spirit += spirit
  stats.reports += 1
  map.set(teamId, stats)
}

function getAverageMap(map: Map<string, TSpiritStats>) {
  const averageMap = new Map<string, number>()
  for (const [teamId, stats] of map) {
    averageMap.set(teamId, stats.spirit / stats.reports)
  }
  return averageMap
}
