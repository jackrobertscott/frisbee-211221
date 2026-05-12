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
  | 'normalizedAverage'
  | 'allocatedSpirit'
  | 'allocatedReports'
  | 'allocatedAverage'
  | 'normalizedAllocatedAverage'
  | 'avgDiff'
  | 'normalizedDifference'

export const DashboardSpirit: FC = () => {
  const auth = useAuth()
  const themeMode = useTheme()
  const $spiritLoad = useEndpoint($FeatureDashboardSpiritLoad)
  const [rows, rowsSet] = useState<TFeatureSpiritRow[]>()
  const [sortKey, sortKeySet] = useState<TSpiritSortKey>('normalizedAverage')
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
      normalizedAverage: 'normalizedReceivedAverage',
      allocatedSpirit: 'allocatedSpirit',
      allocatedReports: 'allocatedReports',
      allocatedAverage: 'allocatedAverage',
      normalizedAllocatedAverage: 'normalizedAllocatedAverage',
      avgDiff: 'averageDifference',
      normalizedDifference: 'normalizedDifference',
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
    const normalized = Math.abs(value) < 0.005 ? 0 : value
    return averageFormatter.format(normalized)
  }

  const getDifferenceBadge = (value: number) => {
    const normalized = Math.abs(value) < 0.005 ? 0 : value
    const isDarkMode = themeMode.current === 'dark'
    const background =
      normalized > 1
        ? hsla.create(60, 70, 50, 0.2)
        : normalized < -1
          ? hsla.create(0, 70, 50, 0.2)
          : undefined
    const font =
      normalized > 1
        ? hsla.create(60, 70, isDarkMode ? 74 : 30, 1)
        : normalized < -1
          ? hsla.create(0, 70, isDarkMode ? 78 : 30, 1)
          : undefined

    return $(FormLabel, {
      label: formatAverage(normalized),
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
                  normalizedAverage: {
                    label: 'Norm Got',
                    grow: 2,
                    click: () => toggleSort('normalizedAverage'),
                    prefixIcon: getSortIcon('normalizedAverage'),
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
                  normalizedAllocatedAverage: {
                    label: 'Norm Sent',
                    grow: 2,
                    click: () => toggleSort('normalizedAllocatedAverage'),
                    prefixIcon: getSortIcon('normalizedAllocatedAverage'),
                  },
                  avgDiff: {
                    label: 'Avg Diff',
                    grow: 2,
                    click: () => toggleSort('avgDiff'),
                    prefixIcon: getSortIcon('avgDiff'),
                  },
                  normalizedDifference: {
                    label: 'Norm Diff',
                    grow: 2,
                    click: () => toggleSort('normalizedDifference'),
                    prefixIcon: getSortIcon('normalizedDifference'),
                  },
                },
                body: rows.map(
                  ({
                    team,
                    receivedSpirit,
                    receivedReports,
                    receivedAverage,
                    normalizedReceivedAverage,
                    allocatedSpirit,
                    allocatedReports,
                    allocatedAverage,
                    normalizedAllocatedAverage,
                    averageDifference,
                    normalizedDifference,
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
                        normalizedAverage: {
                          value: formatAverage(normalizedReceivedAverage),
                        },
                        allocatedSpirit: {value: allocatedSpirit},
                        allocatedReports: {value: allocatedReports},
                        allocatedAverage: {
                          value: formatAverage(allocatedAverage),
                        },
                        normalizedAllocatedAverage: {
                          value: formatAverage(normalizedAllocatedAverage),
                        },
                        avgDiff: {
                          children: getDifferenceBadge(averageDifference),
                        },
                        normalizedDifference: {
                          children: getDifferenceBadge(normalizedDifference),
                        },
                      },
                    }
                  },
                ),
              }),
            ]),
          }),
  })
}
