import {authPoint} from '@shared/auth/authAccess'
import {TReportSearchRow} from '@shared/endpoints/ReportDef'
import {css} from '@emotion/css'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useRef, useState} from 'react'
import {$FeatureDashboardReportsLoad} from '../../endpoints/Feature'
import {
  $ReportCreate,
  $ReportDelete,
  $ReportUpdate,
} from '../../endpoints/Report'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {
  createReportCreatePayload,
  createReportUpdatePayload,
} from '../../utils/renderReportForm'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {InputString} from '../Input/InputString'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Question} from '../Question'
import {ReportModal} from '../ReportModal'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useSling} from '../useThrottle'
import {MissingReportsControl} from './MissingReportsModal'

export const DashboardReports: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const toaster = useToaster()
  const $reportsLoad = useEndpoint($FeatureDashboardReportsLoad)
  const $reportCreate = useEndpoint($ReportCreate)
  const $reportUpdate = useEndpoint($ReportUpdate)
  const $reportDelete = useEndpoint($ReportDelete)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [search, searchSet] = useState('')
  const [reportRows, reportRowsSet] = useState<TReportSearchRow[]>()
  const [creating, creatingSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const reportListRequestId = useRef(0)
  const current = currentId
    ? reportRows?.find((i) => i.report.id === currentId)
    : undefined
  const currentReport = current?.report
  const seasonId = auth.season!.id
  const reportList = ({
    search: nextSearch = search,
    pager: nextPager = pager.data,
  }: {
    search?: string
    pager?: typeof pager.data
  } = {}) => {
    const requestId = ++reportListRequestId.current
    return $reportsLoad
      .fetch({...nextPager, seasonId, search: nextSearch})
      .then((i) => {
        if (requestId !== reportListRequestId.current) return
        reportRowsSet(i.reports)
        fixturesSet(i.fixtures)
        teamsSet(i.teams)
        pager.totalSet(i.count)
      })
  }
  const reportListDelay = useSling(500, reportList)
  useEffect(() => {
    if (!auth.can(authPoint.reportManage)) {
      go.to('/')
      return
    }
    reportList()
  }, [auth.current, pager.data, seasonId])

  useEffect(() => {
    if (!auth.can(authPoint.reportManage) || reportRows === undefined) {
      return
    }

    if (pager.skip !== 0) {
      pager.dataSet({...pager.data, skip: 0})
      return
    }

    reportListDelay()
  }, [search])

  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin,
        children:
          reportRows === undefined
            ? $(Spinner)
            : addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    gap: theme.fib[5],
                  }),
                  children: addkeys([
                    $(InputString, {
                      value: search,
                      valueSet: searchSet,
                      placeholder: 'Search',
                    }),
                    $('div', {
                      children: $(MissingReportsControl, {
                        seasonId,
                      }),
                    }),
                    $(FormBadge, {
                      label: 'Create Report',
                      noshrink: true,
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
                  body: reportRows.map((row) => {
                    const report = row.report
                    return {
                      key: row.report.id,
                      click: () => currentIdSet(row.report.id),
                      data: {
                        fixture: {value: row.fixtureTitle},
                        by: {
                          value: row.teamName,
                          color: row.teamColor,
                        },
                        against: {
                          value: row.againstName,
                          color: row.againstColor,
                        },
                        spirit: {
                          value: auth.season?.useOfficialScoring
                            ? (report.spiritP1 ?? 0) +
                              (report.spiritP2 ?? 0) +
                              (report.spiritP3 ?? 0) +
                              (report.spiritP4 ?? 0) +
                              (report.spiritP5 ?? 0)
                            : (report.spirit ?? 0),
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
                          value: row.submitterName,
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
                  count: reportRows?.length,
                }),
              ]),
      }),
      $(Fragment, {
        children:
          creating &&
          teams !== undefined &&
          fixtures !== undefined &&
          $(ReportModal, {
            title: 'New Report',
            initialTeams: teams,
            initialFixtures: fixtures,
            loading: $reportCreate.loading,
            variant: 'dashboard',
            onSubmit: (data) => {
              const payload = createReportCreatePayload(data)
              if (!payload) {
                return
              }

              $reportCreate.fetch(payload).then(() => {
                const nextPager = {...pager.data, skip: 0}
                toaster.notify('Report created.')
                creatingSet(false)
                searchSet('')
                reportList({
                  search: '',
                  pager: nextPager,
                })
                if (pager.skip !== 0) pager.dataSet(nextPager)
              })
            },
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          currentReport &&
          teams !== undefined &&
          fixtures !== undefined &&
          $(ReportModal, {
            title: 'Edit Report',
            initialTeams: teams,
            initialFixtures: fixtures,
            initialData: currentReport,
            submitter: current.submitterName,
            options: [{label: 'Delete', click: () => deletingSet(true)}],
            loading: $reportUpdate.loading,
            variant: 'dashboard',
            onSubmit: (data) => {
              const payload = createReportUpdatePayload(currentReport.id, data)
              if (!payload) {
                return
              }

              $reportUpdate.fetch(payload).then(() => {
                toaster.notify('Report updated.')
                reportList()
              })
            },
            close: () => currentIdSet(undefined),
          }),
      }),
      $(Fragment, {
        children:
          deleting &&
          currentReport &&
          $(Question, {
            title: 'Delete Report',
            description: `Are you sure you wish to permanently delete this report?`,
            close: () => deletingSet(false),
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: $reportDelete.loading ? 'Loading' : 'Delete',
                click: () =>
                  $reportDelete.fetch({reportId: currentReport.id}).then(() => {
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
