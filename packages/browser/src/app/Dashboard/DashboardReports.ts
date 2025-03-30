import {css} from '@emotion/css'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
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
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {hsla} from '../../utils/hsla'
import {
  renderAgainstTeamSelect,
  renderFixtureSelect,
  renderMVPInputs,
  renderScoreInputs,
  renderSpiritInputs,
  renderSubmitButton,
  renderTeamSelect,
  validateReportForm,
} from '../../utils/renderReportForm'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
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
  const seasonId = auth.season!.id
  const reportList = () =>
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
        background: theme.bgAdmin,
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
                      label: 'Create Score Report',
                      background: theme.bgAdminButton,
                      click: () => creatingSet(true),
                    }),
                  ]),
                }),
                $(Table, {
                  head: {
                    fixture: {label: 'Fixture', grow: 2},
                    by: {label: 'By', grow: 3},
                    against: {label: 'Against', grow: 3},
                    spirit: {label: 'Spirit', grow: 1.5},
                    mvps: {label: 'MVPs', grow: 1.5},
                    comment: {label: 'Comment', grow: 4},
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
                        comment: {
                          children: $(FormLabel, {
                            label: report.spiritComment.trim() || '...',
                            wrap: true,
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
                        borderTop: `${theme.borderWidth}px dashed ${hsla
                          .create(0, 0, 0, 0.25)
                          .string()}`,
                        paddingTop: theme.fib[5],
                        '& > *:not(:last-child)': {
                          marginBottom: theme.fib[5],
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
  const [againstOptions, againstOptionsSet] =
    useState<Array<{team: TTeam; users: TUserPublic[]}>>()
  const form = useForm({
    teamId: undefined as undefined | string,
    againstTeamId: undefined as undefined | string,
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
        .then((againstTeams) => {
          againstOptionsSet(againstTeams)
          if (againstTeams.length === 1) {
            form.patch({againstTeamId: againstTeams[0].team.id})
          } else if (data?.teamAgainstId) {
            form.patch({againstTeamId: data.teamAgainstId})
          }
        })
    }
  }, [form.data.fixtureId, form.data.teamId])

  const chosenAgainst = againstOptions?.find(
    (i) => i.team.id === form.data.againstTeamId
  )

  const handleSubmit = () => {
    const errorMessage = validateReportForm(form.data)
    if (errorMessage) {
      return toaster.error(errorMessage)
    }
    dataSet(form.data)
  }

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
            background: theme.bgMinor,
            children: addkeys([
              renderFixtureSelect(
                form.data.fixtureId,
                form.link('fixtureId'),
                fixtures
              ),
              $(FormColumn, {
                children: addkeys([
                  renderTeamSelect(
                    form.data.teamId,
                    form.link('teamId'),
                    teams,
                    !!data?.teamId
                  ),
                  againstOptions &&
                    renderAgainstTeamSelect(
                      form.data.againstTeamId,
                      form.link('againstTeamId'),
                      againstOptions,
                      !!data?.teamAgainstId
                    ),
                ]),
              }),
              $(Fragment, {
                children:
                  !againstOptions &&
                  form.data.teamId &&
                  form.data.fixtureId &&
                  $(Spinner),
              }),
              $(Fragment, {
                children:
                  againstOptions &&
                  addkeys([
                    renderScoreInputs(
                      form.data.scoreFor,
                      form.link('scoreFor'),
                      form.data.scoreAgainst,
                      form.link('scoreAgainst'),
                      true
                    ),
                    $(Fragment, {
                      children:
                        chosenAgainst &&
                        renderMVPInputs(
                          form.data.mvpMale,
                          form.link('mvpMale'),
                          form.data.mvpFemale,
                          form.link('mvpFemale'),
                          chosenAgainst.users
                        ),
                    }),
                    renderSpiritInputs(
                      form.data.spirit,
                      (value) => form.patch({spirit: value}),
                      form.data.spiritComment,
                      form.link('spiritComment')
                    ),
                    renderSubmitButton(loading, handleSubmit),
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
}> = ({reports}) => {
  const calcMvp = () => {
    const tally = reports.reduce((all, {mvpMale, mvpFemale}) => {
      if (mvpMale) {
        all[mvpMale] ??= [0, 0]
        all[mvpMale][0] = all[mvpMale][0] + 1
      }
      if (mvpFemale) {
        all[mvpFemale] ??= [0, 0]
        all[mvpFemale][1] = all[mvpFemale][1] + 1
      }
      return all
    }, {} as Record<string, number[]>)
    return Object.keys(tally)
      .map((i) => ({
        userId: i,
        votes: tally[i][0] + tally[i][1],
        gender: tally[i][0] > tally[i][1] ? 0 : 1,
      }))
      .sort((a, b) => b.votes - a.votes)
      .filter((a) => a.votes > 0)
  }
  const [users, usersSet] = useState<TUserPublic[]>()
  const [userIdsAndVotes, usersAndVotesSet] = useState(calcMvp)
  const $userList = useEndpoint($UserListManyById)
  useEffect(() => {
    usersAndVotesSet(calcMvp)
  }, [reports])
  useEffect(() => {
    if (userIdsAndVotes.length)
      $userList
        .fetch({userIds: userIdsAndVotes.map((i) => i.userId)})
        .then(usersSet)
  }, [userIdsAndVotes.map((i) => i.userId).join()])
  const usersAndVotes = userIdsAndVotes
    .map(({userId, votes, gender}) => {
      const user = users?.find((j) => j.id === userId)
      return {
        key: userId,
        gender:
          user?.gender === 'male' ? 0 : user?.gender === 'female' ? 1 : gender,
        data: {
          user: {value: user ? `${user.firstName} ${user.lastName}` : userId},
          votes: {value: votes},
        },
      }
    })
    .sort((a, b) => {
      const diff = b.data.votes.value - a.data.votes.value
      if (diff !== 0) return diff
      return a.data.user.value.localeCompare(b.data.user.value)
    })
  return $('div', {
    className: css({
      flexGrow: 1,
      display: 'flex',
      '& > *:not(:last-child)': {marginRight: theme.fib[5]},
      [theme.ltMedia(theme.fib[14])]: {
        flexDirection: 'column',
        '& > *:not(:last-child)': {
          marginBottom: theme.fib[5],
          marginRight: 0,
        },
      },
    }),
    children: addkeys([
      $(FormColumn, {
        grow: true,
        children: addkeys([
          $(FormBadge, {
            label: 'Male MVP Votes',
            background: theme.bgMinor,
          }),
          $(Table, {
            head: {
              user: {label: 'User', grow: 2},
              votes: {label: 'Votes', grow: 1},
            },
            body: usersAndVotes.filter((i) => i.gender === 0),
          }),
        ]),
      }),
      $(FormColumn, {
        grow: true,
        children: addkeys([
          $(FormBadge, {
            label: 'Female MVP Votes',
            background: theme.bgMinor,
          }),
          $(Table, {
            head: {
              user: {label: 'User', grow: 2},
              votes: {label: 'Votes', grow: 1},
            },
            body: usersAndVotes.filter((i) => i.gender === 1),
          }),
        ]),
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
