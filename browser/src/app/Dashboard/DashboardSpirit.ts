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

export const DashboardSpirit: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()
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

  const calculate = () =>
    teams?.map((team) => {
      const received = getSpiritSummary(
        reports?.filter((report) => report.teamAgainstId === team.id) ?? []
      )
      const allocated = getSpiritSummary(
        reports?.filter((report) => report.teamId === team.id) ?? []
      )

      return {team, received, allocated}
    }) ?? []

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
                  team: {label: 'Team', grow: 3},
                  spirit: {label: 'Pnts Got', grow: 1},
                  reports: {label: 'Rpts Got', grow: 1},
                  average: {label: 'Avg Got', grow: 1},
                  allocatedSpirit: {label: 'Pnts Sent', grow: 1},
                  allocatedReports: {label: 'Rpts Sent', grow: 1},
                  allocatedAverage: {label: 'Avg Sent', grow: 1},
                  avgDiff: {label: 'Avg Diff', grow: 1},
                },
                body: calculate()
                  .sort((a, b) => b.received.spirit - a.received.spirit)
                  .map(({team, received, allocated}) => {
                    const receivedAverage =
                      received.reportCount > 0
                        ? received.spirit / received.reportCount
                        : 0
                    const allocatedAverage =
                      allocated.reportCount > 0
                        ? allocated.spirit / allocated.reportCount
                        : 0
                    const averageDifference =
                      allocated.reportCount > 0 && received.reportCount > 0
                        ? allocatedAverage - receivedAverage
                        : 0

                    return {
                      key: team.id,
                      data: {
                        team: {
                          value: team.name,
                          color: team.color,
                        },
                        spirit: {value: received.spirit},
                        reports: {value: received.reportCount},
                        average: {
                          value: formatAverage(receivedAverage),
                        },
                        allocatedSpirit: {value: allocated.spirit},
                        allocatedReports: {value: allocated.reportCount},
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
                  }),
              }),
            ]),
          }),
  })
}
