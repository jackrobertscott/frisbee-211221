import {authPoint} from '@shared/auth/authAccess'
import {
  TFeatureSpiritRow,
  TFeatureSpiritSortKey,
} from '@shared/endpoints/FeatureDef'
import {createElement as $, FC, useEffect, useState} from 'react'
import {$FeatureDashboardSpiritLoad} from '../../endpoints/Feature'
import {theme, useTheme} from '../../theme'
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
  | 'division'
  | 'spirit'
  | 'reports'
  | 'average'
  | 'adjustedReceivedAverage'
  | 'allocatedSpirit'
  | 'allocatedReports'
  | 'allocatedAverage'
  | 'adjustedAllocatedAverage'
  | 'avgDiff'
  | 'adjustedDifference'

export const DashboardSpirit: FC = () => {
  const auth = useAuth()
  const themeMode = useTheme()
  const $spiritLoad = useEndpoint($FeatureDashboardSpiritLoad)
  const [rows, rowsSet] = useState<TFeatureSpiritRow[]>()
  const [sortKey, sortKeySet] = useState<TSpiritSortKey>(
    'adjustedReceivedAverage',
  )
  const [sortDirection, sortDirectionSet] = useState<'asc' | 'desc'>('desc')
  const seasonId = auth.season!.id
  const averageFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  })

  useEffect(() => {
    if (!auth.can(authPoint.reportManage)) {
      go.to('/')
      return
    }

    const sortMap: Record<TSpiritSortKey, TFeatureSpiritSortKey> = {
      team: 'team',
      division: 'division',
      spirit: 'receivedSpirit',
      reports: 'receivedReports',
      average: 'receivedAverage',
      adjustedReceivedAverage: 'adjustedReceivedAverage',
      allocatedSpirit: 'allocatedSpirit',
      allocatedReports: 'allocatedReports',
      allocatedAverage: 'allocatedAverage',
      adjustedAllocatedAverage: 'adjustedAllocatedAverage',
      avgDiff: 'averageDifference',
      adjustedDifference: 'adjustedDifference',
    }
    $spiritLoad
      .fetch({
        seasonId,
        sortBy: sortMap[sortKey],
        sortDirection,
      })
      .then((data) => rowsSet(data.rows))
  }, [auth.current, seasonId, sortKey, sortDirection])

  const formatAverage = (value: number) => {
    const displayValue = Math.abs(value) < 0.005 ? 0 : value
    return averageFormatter.format(displayValue)
  }

  const getDifferenceBadge = (value: number) => {
    const displayValue = Math.abs(value) < 0.005 ? 0 : value
    const isDarkMode = themeMode.current === 'dark'
    const background =
      displayValue > 1
        ? hsla.create(60, 70, 50, 0.2)
        : displayValue < -1
          ? hsla.create(0, 70, 50, 0.2)
          : undefined
    const font =
      displayValue > 1
        ? hsla.create(60, 70, isDarkMode ? 74 : 30, 1)
        : displayValue < -1
          ? hsla.create(0, 70, isDarkMode ? 78 : 30, 1)
          : undefined

    return $(FormLabel, {
      label: formatAverage(displayValue),
      background,
      font,
      grow: true,
    })
  }

  const toggleSort = (key: TSpiritSortKey) => {
    if (sortKey === key) {
      sortDirectionSet((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    sortKeySet(key)
    sortDirectionSet(key === 'team' || key === 'division' ? 'asc' : 'desc')
  }

  const getSortIcon = (key: TSpiritSortKey) => {
    if (sortKey !== key) return undefined
    return sortDirection === 'asc' ? 'angle-up' : 'angle-down'
  }

  return $(Form, {
    background: theme.bgAdmin,
    children:
      rows === undefined
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
                    grow: 5,
                    click: () => toggleSort('team'),
                    prefixIcon: getSortIcon('team'),
                  },
                  division: {
                    label: 'Div',
                    grow: 1,
                    click: () => toggleSort('division'),
                    prefixIcon: getSortIcon('division'),
                  },
                  spirit: {
                    label: 'Pnts Got',
                    grow: 2,
                    click: () => toggleSort('spirit'),
                    prefixIcon: getSortIcon('spirit'),
                  },
                  reports: {
                    label: 'Rpts Got',
                    grow: 2,
                    click: () => toggleSort('reports'),
                    prefixIcon: getSortIcon('reports'),
                  },
                  average: {
                    label: 'Avg Got',
                    grow: 2,
                    click: () => toggleSort('average'),
                    prefixIcon: getSortIcon('average'),
                  },
                  adjustedReceivedAverage: {
                    label: 'Adj Got',
                    grow: 2,
                    click: () => toggleSort('adjustedReceivedAverage'),
                    prefixIcon: getSortIcon('adjustedReceivedAverage'),
                  },
                  allocatedSpirit: {
                    label: 'Pnts Sent',
                    grow: 2,
                    click: () => toggleSort('allocatedSpirit'),
                    prefixIcon: getSortIcon('allocatedSpirit'),
                  },
                  allocatedReports: {
                    label: 'Rpts Sent',
                    grow: 2,
                    click: () => toggleSort('allocatedReports'),
                    prefixIcon: getSortIcon('allocatedReports'),
                  },
                  allocatedAverage: {
                    label: 'Avg Sent',
                    grow: 2,
                    click: () => toggleSort('allocatedAverage'),
                    prefixIcon: getSortIcon('allocatedAverage'),
                  },
                  adjustedAllocatedAverage: {
                    label: 'Adj Sent',
                    grow: 2,
                    click: () => toggleSort('adjustedAllocatedAverage'),
                    prefixIcon: getSortIcon('adjustedAllocatedAverage'),
                  },
                  avgDiff: {
                    label: 'Avg Diff',
                    grow: 2,
                    click: () => toggleSort('avgDiff'),
                    prefixIcon: getSortIcon('avgDiff'),
                  },
                  adjustedDifference: {
                    label: 'Adj Diff',
                    grow: 2,
                    click: () => toggleSort('adjustedDifference'),
                    prefixIcon: getSortIcon('adjustedDifference'),
                  },
                },
                body: rows.map(
                  ({
                    team,
                    receivedSpirit,
                    receivedReports,
                    receivedAverage,
                    adjustedReceivedAverage,
                    allocatedSpirit,
                    allocatedReports,
                    allocatedAverage,
                    adjustedAllocatedAverage,
                    averageDifference,
                    adjustedDifference,
                  }) => {
                    return {
                      key: team.id,
                      data: {
                        team: {
                          value: team.name,
                          color: team.color,
                        },
                        division: {
                          value: team.division ?? '',
                        },
                        spirit: {value: receivedSpirit},
                        reports: {value: receivedReports},
                        average: {
                          value: formatAverage(receivedAverage),
                        },
                        adjustedReceivedAverage: {
                          value: formatAverage(adjustedReceivedAverage),
                        },
                        allocatedSpirit: {value: allocatedSpirit},
                        allocatedReports: {value: allocatedReports},
                        allocatedAverage: {
                          value: formatAverage(allocatedAverage),
                        },
                        adjustedAllocatedAverage: {
                          value: formatAverage(adjustedAllocatedAverage),
                        },
                        avgDiff: {
                          children: getDifferenceBadge(averageDifference),
                        },
                        adjustedDifference: {
                          children: getDifferenceBadge(adjustedDifference),
                        },
                      },
                    }
                  },
                ),
              }),
              $(FormLabel, {
                label:
                  'Adjusted Got is the average spirit score received after correcting for how generous or harsh the reporting teams usually score.',
                background: theme.bgMinor,
                font: theme.fontMinor,
                select: 'text',
                wrap: true,
              }),
            ]),
          }),
  })
}
