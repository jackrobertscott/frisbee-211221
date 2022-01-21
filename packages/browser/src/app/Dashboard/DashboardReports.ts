import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $ReportCreate,
  $ReportDelete,
  $ReportGetFixtureAgainst,
  $ReportListOfSeason,
  $ReportUpdate,
} from '../../endpoints/Report'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {$UserListManyById} from '../../endpoints/User'
import {TFixture} from '../../schemas/ioFixture'
import {TReport} from '../../schemas/ioReport'
import {TTeam} from '../../schemas/ioTeam'
import {TUser} from '../../schemas/ioUser'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {SPIRIT_OPTIONS} from '../../utils/constants'
import {go} from '../../utils/go'
import {hsla} from '../../utils/hsla'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputNumber} from '../Input/InputNumber'
import {InputSelect} from '../Input/InputSelect'
import {InputTextarea} from '../Input/InputTextarea'
import {Modal} from '../Modal'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const DashboardReports: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const toaster = useToaster()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfSeason)
  const $reportCreate = useEndpoint($ReportCreate)
  const $reportUpdate = useEndpoint($ReportUpdate)
  const $reportDelete = useEndpoint($ReportDelete)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [_reports, reportsSet] = useState<TReport[]>()
  const [creating, creatingSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const current = currentId && _reports?.find((i) => i.id === currentId)
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
                      click: () => creatingSet(true),
                    }),
                  ]),
                }),
                $(Table, {
                  head: {
                    fixture: {label: 'Fixture', grow: 2},
                    by: {label: 'By', grow: 3},
                    against: {label: 'Against', grow: 3},
                    spirit: {label: 'Spirit', grow: 2},
                    mvps: {label: 'MVPs', grow: 1},
                    createdOn: {label: 'Created', grow: 2},
                  },
                  body: reports.map((report) => {
                    const fixture = fixtures?.find((i) => {
                      return i.id === report.fixtureId
                    })
                    const teamBy = teams?.find((i) => {
                      return i.id === report.teamId
                    })
                    const teamAgainst = teams?.find((i) => {
                      return i.id === report.teamAgainstId
                    })
                    return {
                      key: report.id,
                      click: () => currentIdSet(report.id),
                      data: {
                        fixture: {value: fixture?.title ?? report.fixtureId},
                        by: {
                          value: teamBy?.name ?? report.teamId,
                          color: teamBy?.color,
                        },
                        against: {
                          value: teamAgainst?.name ?? report.teamAgainstId,
                          color: teamAgainst?.color,
                        },
                        spirit: {value: report.spirit},
                        mvps: {
                          children: $(FormLabel, {
                            multiple: 0.9,
                            icon:
                              report.mvpFemale && report.mvpMale
                                ? 'check'
                                : 'times',
                          }),
                        },
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
                        [theme.ltMedia(theme.fib[14])]: {
                          flexDirection: 'column',
                          '& > *:not(:last-child)': {
                            marginBottom: theme.fib[5],
                            marginRight: 0,
                          },
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
      $(Fragment, {
        children:
          creating &&
          teams !== undefined &&
          fixtures !== undefined &&
          $(_DashboardReportsForm, {
            title: 'New Report',
            teams,
            fixtures,
            loading: $reportCreate.loading,
            dataSet: (data: any) =>
              $reportCreate.fetch(data).then(() => {
                toaster.notify('Report created.')
                creatingSet(false)
                reportList()
              }),
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          current &&
          teams !== undefined &&
          fixtures !== undefined &&
          $(_DashboardReportsForm, {
            title: 'Edit Report',
            teams,
            fixtures,
            data: current,
            options: [{label: 'Delete', click: () => deletingSet(true)}],
            loading: $reportUpdate.loading,
            dataSet: (data: any) =>
              $reportUpdate.fetch({...data, reportId: current.id}).then(() => {
                toaster.notify('Report updated.')
                reportList()
              }),
            close: () => currentIdSet(undefined),
          }),
      }),
      $(Fragment, {
        children:
          deleting &&
          current &&
          $(Question, {
            title: 'Delete Report',
            description: `Are you sure you wish to permanently delete this report?`,
            close: () => deletingSet(false),
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: $reportDelete.loading ? 'Loading' : 'Delete',
                click: () =>
                  $reportDelete.fetch({reportId: current.id}).then(() => {
                    currentIdSet(undefined)
                    deletingSet(false)
                    reportList()
                  }),
              },
            ],
          }),
      }),
    ]),
  })
}
/**
 *
 */
const _DashboardReportsForm: FC<{
  title: string
  teams: TTeam[]
  fixtures: TFixture[]
  loading?: boolean
  options?: {label: string; click: () => void}[]
  data?: Partial<TReport>
  dataSet: (data: Partial<TReport>) => void
  close: () => void
}> = ({title, teams, fixtures, loading, options, data, dataSet, close}) => {
  const toaster = useToaster()
  const $fixtureAgainst = useEndpoint($ReportGetFixtureAgainst)
  const [against, againstSet] = useState<{team: TTeam; users: TUser[]}>()
  const form = useForm({
    teamId: undefined as undefined | string,
    fixtureId: undefined as undefined | string,
    scoreFor: undefined as undefined | number,
    scoreAgainst: undefined as undefined | number,
    mvpMale: undefined as undefined | string,
    mvpFemale: undefined as undefined | string,
    spirit: undefined as undefined | number,
    spiritComment: '',
    ...data,
  })
  useEffect(() => {
    if (form.data.fixtureId && form.data.teamId) {
      $fixtureAgainst
        .fetch({fixtureId: form.data.fixtureId, teamId: form.data.teamId})
        .then(({teamAgainst, users}) => againstSet({team: teamAgainst, users}))
    }
  }, [form.data.fixtureId, form.data.teamId])
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: title,
              }),
              $(Fragment, {
                children: options?.map((i) => {
                  return $(TopBarBadge, {
                    key: i.label,
                    label: i.label,
                    click: i.click,
                  })
                }),
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
          }),
          $(Form, {
            children: addkeys([
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Fixture'}),
                  $(InputSelect, {
                    value: form.data.fixtureId,
                    valueSet: form.link('fixtureId'),
                    options: fixtures.map((i) => ({
                      key: i.id,
                      label: `${i.title} - ${dayjs(i.date).format('DD/MM/YY')}`,
                    })),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'For'}),
                  $(InputSelect, {
                    value: form.data.teamId,
                    valueSet: form.link('teamId'),
                    options: teams.map((i) => ({
                      key: i.id,
                      label: i.name,
                      color: i.color,
                    })),
                  }),
                ]),
              }),
              $(Fragment, {
                children:
                  !against &&
                  form.data.teamId &&
                  form.data.fixtureId &&
                  $(Spinner),
              }),
              $(Fragment, {
                children:
                  against &&
                  addkeys([
                    $(FormRow, {
                      children: addkeys([
                        $(FormLabel, {label: 'Against'}),
                        $(FormLabel, {
                          grow: true,
                          label: against.team.name,
                          font: hsla.digest(against.team.color).compliment(),
                          background: hsla.digest(against.team.color),
                        }),
                      ]),
                    }),
                    $(FormColumn, {
                      children: addkeys([
                        $(FormRow, {
                          children: addkeys([
                            $(FormLabel, {label: 'For Score'}),
                            $(InputNumber, {
                              value: form.data.scoreFor,
                              valueSet: form.link('scoreFor'),
                            }),
                          ]),
                        }),
                        $(FormRow, {
                          children: addkeys([
                            $(FormLabel, {label: 'Against Score'}),
                            $(InputNumber, {
                              value: form.data.scoreAgainst,
                              valueSet: form.link('scoreAgainst'),
                            }),
                          ]),
                        }),
                      ]),
                    }),
                    $(FormColumn, {
                      children: addkeys([
                        $(FormRow, {
                          children: addkeys([
                            $(FormLabel, {label: 'MVP Male'}),
                            $(InputSelect, {
                              value: form.data.mvpMale,
                              valueSet: form.link('mvpMale'),
                              options: against.users.map((i) => ({
                                key: i.id,
                                label: `${i.firstName} ${i.lastName}`,
                              })),
                            }),
                          ]),
                        }),
                        $(FormRow, {
                          children: addkeys([
                            $(FormLabel, {label: 'MVP Female'}),
                            $(InputSelect, {
                              value: form.data.mvpFemale,
                              valueSet: form.link('mvpFemale'),
                              options: against.users.map((i) => ({
                                key: i.id,
                                label: `${i.firstName} ${i.lastName}`,
                              })),
                            }),
                          ]),
                        }),
                      ]),
                    }),
                    $(FormColumn, {
                      children: addkeys([
                        $(FormLabel, {label: 'Spirit'}),
                        $(InputSelect, {
                          value: form.data.spirit?.toString(),
                          valueSet: (i) => form.patch({spirit: +i}),
                          placeholder: 'Select...',
                          options: SPIRIT_OPTIONS,
                        }),
                        $(FormRow, {
                          children: addkeys([
                            $(InputTextarea, {
                              rows: 2,
                              value: form.data.spiritComment,
                              valueSet: form.link('spiritComment'),
                              placeholder: 'Write a comment (optional) ...',
                            }),
                          ]),
                        }),
                      ]),
                    }),
                    $(FormBadge, {
                      disabled: loading,
                      label: loading ? 'Loading' : 'Submit',
                      click: () => {
                        if (form.data.mvpMale === form.data.mvpFemale) {
                          const message =
                            'The male and female MVP can not be the same person.'
                          return toaster.error(message)
                        }
                        dataSet(form.data)
                      },
                    }),
                  ]),
              }),
            ]),
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
          user: {label: 'User', grow: 2},
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
          team: {label: 'Fixture', grow: 2},
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
