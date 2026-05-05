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
import {
  createReportFormDataFromReport,
  renderAgainstTeamSelect,
  renderFixtureSelect,
  renderMVPInputs,
  renderOfficialSpiritInputs,
  renderScoreInputs,
  renderSpiritInputs,
  renderSubmitButton,
  renderTeamSelect,
  sanitizeReportFormMvps,
  validateReportForm,
} from '../../utils/renderReportForm'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
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

export const DashboardReports: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const toaster = useToaster()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfSeason)
  const $userList = useEndpoint($UserListManyById)
  const $reportCreate = useEndpoint($ReportCreate)
  const $reportUpdate = useEndpoint($ReportUpdate)
  const $reportDelete = useEndpoint($ReportDelete)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [_reports, reportsSet] = useState<TReport[]>()
  const [submitters, submittersSet] = useState<TUserPublic[]>()
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
  useEffect(() => {
    if (!_reports) return

    const userIds = Array.from(
      new Set(_reports.map((report) => report.userId).filter(Boolean))
    ) as string[]

    if (!userIds.length) {
      submittersSet([])
      return
    }

    let cancelled = false
    $userList.fetch({userIds}).then((users) => {
      if (!cancelled) submittersSet(users)
    })

    return () => {
      cancelled = true
    }
  }, [_reports])
  const submitterLabel = (report: TReport) => {
    const submitter = submitters?.find((i) => i.id === report.userId)
    if (submitter) return `${submitter.firstName} ${submitter.lastName}`.trim()
    return report.userId ?? '...'
  }
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
                      label: 'Create Report',
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
                    spirit: {
                      label: 'Spirit',
                      grow: 1.5,
                    },
                    mvps: {
                      label: 'MVPs',
                      grow: 1.5,
                    },
                    comment: {label: 'Comment', grow: 5},
                    submitter: {label: 'Submitted by', grow: 3},
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
                        spirit: {
                          value: auth.season?.useOfficialScoring
                            ? (report.spiritP1 ?? 0) +
                              (report.spiritP2 ?? 0) +
                              (report.spiritP3 ?? 0) +
                              (report.spiritP4 ?? 0) +
                              (report.spiritP5 ?? 0)
                            : report.spirit ?? 0,
                        },
                        mvps: {
                          children: $(FormLabel, {
                            multiple: 0.9,
                            icon: auth.season?.useOfficialScoring
                              ? report.mvpFemale &&
                                report.mvpMale &&
                                report.mvpFemale2 &&
                                report.mvpMale2
                                ? 'check'
                                : report.mvpFemale && report.mvpMale // At least primary MVPs are selected
                                ? 'exclamation-circle'
                                : 'times'
                              : report.mvpFemale && report.mvpMale
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
                        submitter: {
                          value: submitterLabel(report),
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
            submitter: submitters?.find((i) => i.id === current.userId),
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

const _DashboardReportsForm: FC<{
  title: string
  teams: TTeam[]
  fixtures: TFixture[]
  loading?: boolean
  options?: {label: string; click: () => void}[]
  data?: Partial<TReport>
  submitter?: TUserPublic
  dataSet: (data: Partial<TReport>) => void
  close: () => void
}> = ({
  title,
  teams,
  fixtures,
  loading,
  options,
  data,
  submitter,
  dataSet,
  close,
}) => {
  const auth = useAuth()
  const toaster = useToaster()
  const $fixtureAgainst = useEndpoint($ReportGetFixtureAgainst)
  const [againstOptions, againstOptionsSet] =
    useState<Array<{team: TTeam; users: TUserPublic[]}>>()

  // Check if the season uses official scoring
  const useOfficialScoring = auth.season?.useOfficialScoring === true

  const form = useForm(createReportFormDataFromReport(data))

  useEffect(() => {
    againstOptionsSet(undefined)
    form.set(createReportFormDataFromReport(data))
  }, [data?.id])

  useEffect(() => {
    if (!form.data.fixtureId || !form.data.teamId) {
      againstOptionsSet(undefined)
      return
    }

    let cancelled = false
    const currentAgainstTeamId = form.data.againstTeamId

    againstOptionsSet(undefined)

    $fixtureAgainst
      .fetch({fixtureId: form.data.fixtureId, teamId: form.data.teamId})
      .then((nextAgainstOptions) => {
        if (cancelled) return

        againstOptionsSet(nextAgainstOptions)
        const hasCurrentSelection = nextAgainstOptions.some(
          (option) => option.team.id === currentAgainstTeamId
        )

        form.patch({
          againstTeamId:
            nextAgainstOptions.length === 1
              ? nextAgainstOptions[0].team.id
              : hasCurrentSelection
              ? currentAgainstTeamId
              : undefined,
        })
      })

    return () => {
      cancelled = true
    }
  }, [form.data.fixtureId, form.data.teamId])

  const chosenAgainst = againstOptions?.find(
    (i) => i.team.id === form.data.againstTeamId
  )

  useEffect(() => {
    const nextMvps = sanitizeReportFormMvps(form.data, chosenAgainst?.users)

    if (
      nextMvps.mvpMale === form.data.mvpMale &&
      nextMvps.mvpFemale === form.data.mvpFemale &&
      nextMvps.mvpMale2 === form.data.mvpMale2 &&
      nextMvps.mvpFemale2 === form.data.mvpFemale2
    ) {
      return
    }

    form.patch(nextMvps)
  }, [
    chosenAgainst,
    form.data.mvpMale,
    form.data.mvpFemale,
    form.data.mvpMale2,
    form.data.mvpFemale2,
  ])

  const handleSubmit = () => {
    const errorMessage = validateReportForm(form.data, useOfficialScoring)
    if (errorMessage) {
      return toaster.error(errorMessage)
    }
    dataSet(form.data)
  }

  const submittedBy = submitter
    ? `${submitter.firstName} ${submitter.lastName}`.trim()
    : data?.userId
    ? data.userId
    : undefined

  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: theme.fib[13],
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
              submittedBy &&
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Submitted by'}),
                    $(FormLabel, {
                      label: submittedBy,
                      background: theme.bgDisabled,
                      grow: true,
                    }),
                  ]),
                }),
              renderFixtureSelect(
                form.data.fixtureId,
                form.link('fixtureId'),
                fixtures,
                !!data?.fixtureId
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
                          chosenAgainst.users,
                          useOfficialScoring,
                          form.data.mvpMale2,
                          form.link('mvpMale2'),
                          form.data.mvpFemale2,
                          form.link('mvpFemale2')
                        ),
                    }),
                    // Render spirit form based on scoring type
                    useOfficialScoring
                      ? renderOfficialSpiritInputs(
                          form.data.spiritP1,
                          (value) => form.patch({spiritP1: value}),
                          form.data.spiritP2,
                          (value) => form.patch({spiritP2: value}),
                          form.data.spiritP3,
                          (value) => form.patch({spiritP3: value}),
                          form.data.spiritP4,
                          (value) => form.patch({spiritP4: value}),
                          form.data.spiritP5,
                          (value) => form.patch({spiritP5: value}),
                          form.data.spiritComment,
                          form.link('spiritComment')
                        )
                      : renderSpiritInputs(
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
