import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$ReportListOfSeason} from '../../endpoints/Report'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {$UserListManyById} from '../../endpoints/User'
import {TFixture} from '../../schemas/ioFixture'
import {TReport} from '../../schemas/ioReport'
import {TTeam} from '../../schemas/ioTeam'
import {TUser} from '../../schemas/ioUser'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {hsla} from '../../utils/hsla'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useEndpoint} from '../useEndpoint'
/**
 *
 */
export const DashboardReports: FC<{}> = () => {
  const auth = useAuth()
  const pager = usePager()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [_reports, reportsSet] = useState<TReport[]>()
  const seasonId = auth.current?.season?.id
  const reportList = () =>
    seasonId &&
    $reportList.fetch({seasonId}).then((i) => {
      reportsSet(i.reports)
      fixturesSet(i.fixtures)
      pager.totalSet(i.count)
    })
  const teamList = () =>
    seasonId && $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    else {
      reportList()
      teamList()
    }
  }, [auth.current, seasonId])
  const reports = _reports?.slice(pager.skip, pager.skip + pager.limit)
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin.lighten(5),
        children:
          reports === undefined
            ? $(Spinner)
            : addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    '& > *:not(:last-child)': {
                      marginRight: theme.fib[5],
                    },
                  }),
                  children: addkeys([
                    $(FormBadge, {
                      grow: true,
                      label: 'Create Report',
                      background: theme.bgAdmin,
                    }),
                    $(FormBadge, {
                      icon: 'wrench',
                      label: 'Repair',
                      background: theme.bgAdmin,
                    }),
                  ]),
                }),
                $(Table, {
                  head: {
                    fixture: {label: 'Fixture', grow: 1},
                    by: {label: 'By', grow: 1},
                    against: {label: 'Against', grow: 1},
                    spirit: {label: 'Spirit', grow: 1},
                    createdOn: {label: 'Created', grow: 1},
                  },
                  body: reports.map((report) => {
                    const fixture = fixtures?.find((i) => {
                      return i.id === report.roundId
                    })
                    const teamBy = teams?.find((i) => {
                      return i.id === report.teamId
                    })
                    const teamAgainst = teams?.find((i) => {
                      return i.id === report.teamAgainstId
                    })
                    return {
                      key: report.id,
                      // click: () => currentIdSet(team.id),
                      data: {
                        fixture: {value: fixture?.title ?? report.roundId},
                        by: {
                          value: teamBy?.name ?? report.teamId,
                          color: teamBy?.color,
                        },
                        against: {
                          value: teamAgainst?.name ?? report.teamAgainstId,
                          color: teamAgainst?.color,
                        },
                        spirit: {value: report.spirit},
                        createdOn: {
                          value: dayjs(report.createdOn).format('DD/MM/YYYY'),
                        },
                      },
                    }
                  }),
                }),
                $(Pager, {
                  ...pager,
                  count: reports?.length,
                }),
                $(Fragment, {
                  children:
                    _reports !== undefined &&
                    teams !== undefined &&
                    $('div', {
                      className: css({
                        display: 'flex',
                        borderTop: `${theme.borderWidth}px dashed ${hsla
                          .create(0, 0, 0, 0.25)
                          .string()}`,
                        paddingTop: theme.fib[5],
                        '& > *:not(:last-child)': {
                          marginRight: theme.fib[5],
                        },
                      }),
                      children: addkeys([
                        $(_DashboardReportsSpirit, {
                          reports: _reports,
                          teams,
                        }),
                        $(_DashboardReportsMVP, {
                          reports: _reports,
                        }),
                      ]),
                    }),
                }),
              ]),
      }),
    ]),
  })
}
/**
 *
 */
const _DashboardReportsMVP: FC<{
  reports: TReport[]
  limit?: number
}> = ({reports, limit = 25}) => {
  const calculate = () => {
    const tally = reports.reduce((all, {mvpMale, mvpFemale}) => {
      if (mvpMale) all[mvpMale] = (all[mvpMale] ?? 0) + 1
      if (mvpFemale) all[mvpFemale] = (all[mvpFemale] ?? 0) + 1
      return all
    }, {} as Record<string, number>)
    return Object.keys(tally)
      .map((i) => ({userId: i, votes: tally[i]}))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, limit)
  }
  const [users, usersSet] = useState<TUser[]>()
  const [usersAndVotes, usersAndVotesSet] = useState(calculate)
  const $userList = useEndpoint($UserListManyById)
  useEffect(() => {
    usersAndVotesSet(calculate)
  }, [reports])
  useEffect(() => {
    if (usersAndVotes.length)
      $userList
        .fetch({userIds: usersAndVotes.map((i) => i.userId)})
        .then(usersSet)
  }, [usersAndVotes.map((i) => i.userId).join()])
  return $(FormColumn, {
    grow: true,
    children: addkeys([
      $(FormBadge, {
        label: 'MVP Scores',
        background: theme.bgMinor,
      }),
      $(Table, {
        head: {
          user: {label: 'User', grow: 1},
          votes: {label: 'Votes', grow: 1},
        },
        body: usersAndVotes.map(({userId, votes}) => {
          const user = users?.find((i) => i.id === userId)
          return {
            key: userId,
            data: {
              user: {
                value: user ? `${user.firstName} ${user.lastName}` : userId,
              },
              votes: {value: votes},
            },
          }
        }),
      }),
    ]),
  })
}
/**
 *
 */
const _DashboardReportsSpirit: FC<{
  reports: TReport[]
  teams: TTeam[]
}> = ({reports, teams}) => {
  const calculate = () =>
    teams
      .map((team) => {
        const spirit = reports
          .filter((i) => i.teamAgainstId === team.id)
          .reduce((a, b) => {
            a += b.spirit
            return a
          }, 0)
        return {team, spirit}
      })
      .sort((a, b) => b.spirit - a.spirit)
  const [teamsAndSpirit, teamsAndSpiritSet] = useState(calculate)
  useEffect(() => {
    teamsAndSpiritSet(calculate)
  }, [reports, teams])
  return $(FormColumn, {
    grow: true,
    children: addkeys([
      $(FormBadge, {
        label: 'Team Spirit Scores',
        background: theme.bgMinor,
      }),
      $(Table, {
        head: {
          team: {label: 'Fixture', grow: 1},
          spirit: {label: 'Spirit', grow: 1},
        },
        body: teamsAndSpirit.map(({team, spirit}) => {
          return {
            key: team.id,
            data: {
              team: {
                value: team.name,
                color: team.color,
              },
              spirit: {value: spirit},
            },
          }
        }),
      }),
    ]),
  })
}
