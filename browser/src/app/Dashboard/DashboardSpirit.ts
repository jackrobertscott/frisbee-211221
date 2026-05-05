import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {createElement as $, FC, useEffect, useState} from 'react'
import {$ReportListOfSeason} from '../../endpoints/Report'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {hsla} from '../../utils/hsla'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useEndpoint} from '../useEndpoint'

type TSpiritSortKey =
  | 'team'
  | 'spirit'
  | 'reports'
  | 'average'
  | 'allocatedSpirit'
  | 'allocatedReports'
  | 'allocatedAverage'
  | 'avgDiff'

type TSpiritRow = {
  team: TTeam
  receivedSpirit: number
  receivedReports: number
  receivedAverage: number
  allocatedSpirit: number
  allocatedReports: number
  allocatedAverage: number
  averageDifference: number
}

type TSpiritNumericField =
  | 'receivedSpirit'
  | 'receivedReports'
  | 'receivedAverage'
  | 'allocatedSpirit'
  | 'allocatedReports'
  | 'allocatedAverage'
  | 'averageDifference'

export const DashboardSpirit: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()
  const [sortKey, sortKeySet] = useState<TSpiritSortKey>('average')
  const [sortDirection, sortDirectionSet] = useState<'asc' | 'desc'>('desc')
  const seasonId = auth.season!.id
  const useOfficialScoring = !!auth.season?.useOfficialScoring
  const averageFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  })

  useEffect(() => {
    if (!auth.isAdmin()) {
      go.to('/')
      return
    }

    $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
    $reportList.fetch({seasonId}).then((i) => reportsSet(i.reports))
  }, [auth.current, seasonId])

  const formatAverage = (value: number) => {
    const normalized = Math.abs(value) < 0.005 ? 0 : value
    return averageFormatter.format(normalized)
  }

  const getAverageDifferenceBadge = (value: number) => {
    const normalized = Math.abs(value) < 0.005 ? 0 : value
    const background =
      normalized > 1
        ? hsla.create(60, 70, 50, 0.2)
        : normalized < -1
        ? hsla.create(0, 70, 50, 0.2)
        : undefined
    const font =
      normalized > 1
        ? hsla.create(60, 70, 30, 1)
        : normalized < -1
        ? hsla.create(0, 70, 30, 1)
        : undefined

    return $(FormLabel, {
      label: formatAverage(normalized),
      background,
      font,
      grow: true,
    })
  }

  const getSpiritSummary = (teamReports: TReport[]) => {
    const reportCount = teamReports.length

    if (useOfficialScoring) {
      const spirit = teamReports.reduce((total, report) => {
        return (
          total +
          (report.spiritP1 ?? 0) +
          (report.spiritP2 ?? 0) +
          (report.spiritP3 ?? 0) +
          (report.spiritP4 ?? 0) +
          (report.spiritP5 ?? 0)
        )
      }, 0)

      return {spirit, reportCount}
    }

    const spirit = teamReports.reduce((total, report) => {
      return total + (report.spirit ?? 0)
    }, 0)

    return {spirit, reportCount}
  }

  const toggleSort = (key: TSpiritSortKey) => {
    if (sortKey === key) {
      sortDirectionSet((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    sortKeySet(key)
    sortDirectionSet(key === 'team' ? 'asc' : 'desc')
  }

  const getSortIcon = (key: TSpiritSortKey) => {
    if (sortKey !== key) return undefined
    return sortDirection === 'asc' ? 'angle-up' : 'angle-down'
  }

  const sortRows = (rows: TSpiritRow[]) => {
    const direction = sortDirection === 'asc' ? 1 : -1
    const valueMap: Record<Exclude<TSpiritSortKey, 'team'>, TSpiritNumericField> = {
      spirit: 'receivedSpirit',
      reports: 'receivedReports',
      average: 'receivedAverage',
      allocatedSpirit: 'allocatedSpirit',
      allocatedReports: 'allocatedReports',
      allocatedAverage: 'allocatedAverage',
      avgDiff: 'averageDifference',
    }

    return [...rows].sort((a, b) => {
      if (sortKey === 'team') {
        return a.team.name.localeCompare(b.team.name) * direction
      }

      const valueKey = valueMap[sortKey]
      return (a[valueKey] - b[valueKey]) * direction
    })
  }

  const calculate = () =>
    sortRows(
      teams?.map((team) => {
        const received = getSpiritSummary(
          reports?.filter((report) => report.teamAgainstId === team.id) ?? []
        )
        const allocated = getSpiritSummary(
          reports?.filter((report) => report.teamId === team.id) ?? []
        )

        const receivedAverage =
          received.reportCount > 0 ? received.spirit / received.reportCount : 0
        const allocatedAverage =
          allocated.reportCount > 0
            ? allocated.spirit / allocated.reportCount
            : 0
        const averageDifference =
          allocated.reportCount > 0 && received.reportCount > 0
            ? allocatedAverage - receivedAverage
            : 0

        return {
          team,
          receivedSpirit: received.spirit,
          receivedReports: received.reportCount,
          receivedAverage,
          allocatedSpirit: allocated.spirit,
          allocatedReports: allocated.reportCount,
          allocatedAverage,
          averageDifference,
        }
      }) ?? []
    )

  return $(Form, {
    background: theme.bgAdmin,
    children:
      reports === undefined || teams === undefined
        ? $(Spinner)
        : $(FormColumn, {
            grow: true,
            children: addkeys([
              $(FormBadge, {
                label: 'Team Spirit Scores',
                background: theme.bgMinor,
              }),
              $(Table, {
                head: {
                  team: {
                    label: 'Team',
                    grow: 3,
                    click: () => toggleSort('team'),
                    icon: getSortIcon('team'),
                  },
                  spirit: {
                    label: 'Pnts Got',
                    grow: 1,
                    click: () => toggleSort('spirit'),
                    icon: getSortIcon('spirit'),
                  },
                  reports: {
                    label: 'Rpts Got',
                    grow: 1,
                    click: () => toggleSort('reports'),
                    icon: getSortIcon('reports'),
                  },
                  average: {
                    label: 'Avg Got',
                    grow: 1,
                    click: () => toggleSort('average'),
                    icon: getSortIcon('average'),
                  },
                  allocatedSpirit: {
                    label: 'Pnts Sent',
                    grow: 1,
                    click: () => toggleSort('allocatedSpirit'),
                    icon: getSortIcon('allocatedSpirit'),
                  },
                  allocatedReports: {
                    label: 'Rpts Sent',
                    grow: 1,
                    click: () => toggleSort('allocatedReports'),
                    icon: getSortIcon('allocatedReports'),
                  },
                  allocatedAverage: {
                    label: 'Avg Sent',
                    grow: 1,
                    click: () => toggleSort('allocatedAverage'),
                    icon: getSortIcon('allocatedAverage'),
                  },
                  avgDiff: {
                    label: 'Avg Diff',
                    grow: 1,
                    click: () => toggleSort('avgDiff'),
                    icon: getSortIcon('avgDiff'),
                  },
                },
                body: calculate().map(
                  ({
                    team,
                    receivedSpirit,
                    receivedReports,
                    receivedAverage,
                    allocatedSpirit,
                    allocatedReports,
                    allocatedAverage,
                    averageDifference,
                  }) => {
                    return {
                      key: team.id,
                      data: {
                        team: {
                          value: team.name,
                          color: team.color,
                        },
                        spirit: {value: receivedSpirit},
                        reports: {value: receivedReports},
                        average: {
                          value: formatAverage(receivedAverage),
                        },
                        allocatedSpirit: {value: allocatedSpirit},
                        allocatedReports: {value: allocatedReports},
                        allocatedAverage: {
                          value: formatAverage(allocatedAverage),
                        },
                        avgDiff: {
                          children: getAverageDifferenceBadge(
                            averageDifference
                          ),
                        },
                      },
                    }
                  }
                ),
              }),
            ]),
          }),
  })
}
